import {
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  type LiveServerToolCall,
  Modality,
  type Session,
} from '@google/genai'

interface WavConversionOptions {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
}

export class GeminiVoiceClient {
  private ai: GoogleGenAI
  private session: Session | undefined
  private responseQueue: LiveServerMessage[] = []
  private connected = false
  private streamingActive = false
  private inputMime = 'audio/pcm;rate=48000' // LiveKitからは48kHzで来る前提
  private onAudioResponseCallback?: (audioBuffer: Buffer) => void

  // ツール定義
  private tools: FunctionDeclaration[] = []

  // 音声バッファリング用
  private audioBuffer: string[] = []
  private audioMimeType: string | undefined
  private bufferTimeout: NodeJS.Timeout | undefined
  private readonly BUFFER_DELAY = 50 // 50ms待機してからバッファを処理
  private isProcessingTurn = false // ターン処理中フラグ

  // 再接続用
  private reconnectTimeout: NodeJS.Timeout | undefined
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT_ATTEMPTS = 5
  private readonly RECONNECT_DELAY = 3000 // 3秒後に再接続

  // ミュート制御
  private isMuted = false

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey })
    this.initializeTools()
  }

  /**
   * ツールを初期化
   */
  private initializeTools(): void {
    // 現在時刻を取得するツール
    this.tools.push({
      name: 'get_current_time',
      description: '現在の日時を取得します',
    })

    // ミュート状態を確認するツール
    this.tools.push({
      name: 'get_mute_state',
      description: '現在のミュート状態を取得します',
    })

    // ミュートを有効にするツール
    this.tools.push({
      name: 'enable_mute',
      description: 'ボットを黙らせます（ミュートを有効にします）',
    })

    // ミュートを解除するツール
    this.tools.push({
      name: 'disable_mute',
      description: 'ボットに話させます（ミュートを解除します）',
    })
  }

  async connect(): Promise<void> {
    if (this.connected) return

    const model = 'gemini-live-2.5-flash-preview'
    //    const model = 'gemini-2.5-flash-preview-native-audio-dialog'
    const config: LiveConnectConfig = {
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Zephyr',
          },
        },
        languageCode: 'ja-JP',
      },
      responseModalities: [Modality.AUDIO],
      tools: [
        {
          functionDeclarations: this.tools,
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: `あなたは親切な音声アシスタントです。

ミュート管理の重要なルール：
1. 応答する前に必ずget_mute_state関数を呼び出して現在のミュート状態を確認してください
2. ミュート中（isMuted: true）の場合は、絶対に音声応答をしないでください
3. ユーザーから「黙って」「静かにして」「黙れ」「うるさい」などの指示を受けた場合：
   - まずenable_mute関数を呼び出してください
   - その後は音声応答を一切しないでください
4. ユーザーから「話して」「しゃべって」「ミュート解除」「話していいよ」という明示的な指示があった場合のみ：
   - disable_mute関数を呼び出してください
   - その後から音声応答を再開してください
5. ミュート中でも、すべてのツール（関数）呼び出しは通常通り行ってください

通常の会話：
- 日本語で親切に応答してください
- ユーザーの質問に的確に答えてください`,
          },
        ],
      },
    }

    this.session = await this.ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          console.log('✅ Gemini音声対話接続成功')
          this.connected = true
          this.reconnectAttempts = 0 // 接続成功時にリセット
        },
        onmessage: (message: LiveServerMessage) => {
          this.responseQueue.push(message)
          // リアルタイム音声応答処理
          this.processRealtimeResponse(message)
        },
        onerror: (e: unknown) => {
          console.error('❌ Gemini接続エラー:', e)
        },
        onclose: (e: unknown) => {
          console.log('🔌 Gemini接続終了:', e)
          this.connected = false

          // 自動再接続の試行
          this.scheduleReconnect()
        },
      },
      config,
    })
  }

  async sendAudio(audioData: Buffer, mimeType: string = 'audio/wav'): Promise<Buffer | null> {
    if (!this.session || !this.connected) {
      console.error('Geminiに接続されていません')
      return null
    }

    // 音声データをbase64エンコード
    const base64Audio = audioData.toString('base64')

    // メッセージ送信
    this.session.sendClientContent({
      turns: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
    })

    // レスポンスを待つ
    const audioParts: string[] = []
    let mimeTypeResponse: string | undefined

    try {
      const turn = await this.handleTurn()

      // 音声パーツを抽出
      for (const message of turn) {
        if (message.serverContent?.modelTurn?.parts) {
          const part = message.serverContent.modelTurn.parts[0]

          if (part?.inlineData) {
            audioParts.push(part.inlineData.data ?? '')
            mimeTypeResponse = part.inlineData.mimeType
          }

          if (part?.text) {
            console.log('📝 Geminiテキスト応答:', part.text)
          }
        }
      }

      if (audioParts.length > 0 && mimeTypeResponse) {
        console.log('🎵 Gemini audio MIME type:', mimeTypeResponse)
        return this.convertToWav(audioParts, mimeTypeResponse)
      }
    } catch (error) {
      console.error('Geminiレスポンス処理エラー:', error)
    }

    return null
  }

  private async handleTurn(): Promise<LiveServerMessage[]> {
    const turn: LiveServerMessage[] = []
    let done = false

    while (!done) {
      const message = await this.waitMessage()
      turn.push(message)

      if (message.serverContent?.turnComplete) {
        done = true
      } else if (message.toolCall) {
        done = true
      }
    }

    return turn
  }

  private async waitMessage(): Promise<LiveServerMessage> {
    while (true) {
      const message = this.responseQueue.shift()
      if (message) {
        return message
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private convertToWav(rawData: string[], mimeType: string): Buffer {
    const options = this.parseMimeType(mimeType)
    const buffers = rawData.map((data) => Buffer.from(data, 'base64'))
    const dataLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
    const wavHeader = this.createWavHeader(dataLength, options)
    const audioData = Buffer.concat(buffers)

    return Buffer.concat([wavHeader, audioData])
  }

  private parseMimeType(mimeType: string): WavConversionOptions {
    const [fileType, ...params] = mimeType.split(';').map((s) => s.trim())
    const [_, format] = fileType.split('/')

    const options: Partial<WavConversionOptions> = {
      numChannels: 1,
      bitsPerSample: 16,
    }

    if (format?.startsWith('L')) {
      const bits = parseInt(format.slice(1), 10)
      if (!Number.isNaN(bits)) {
        options.bitsPerSample = bits
      }
    }

    for (const param of params) {
      const [key, value] = param.split('=').map((s) => s.trim())
      if (key === 'rate') {
        options.sampleRate = parseInt(value, 10)
      }
    }

    return options as WavConversionOptions
  }

  private createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
    const { numChannels, sampleRate, bitsPerSample } = options

    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8
    const buffer = Buffer.alloc(44)

    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataLength, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(numChannels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bitsPerSample, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataLength, 40)

    return buffer
  }

  /**
   * 音声応答のコールバックを設定
   */
  setAudioResponseCallback(callback: (audioBuffer: Buffer) => void): void {
    this.onAudioResponseCallback = callback
  }

  /**
   * 接続状態を取得
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * ミュート状態を取得
   */
  isMute(): boolean {
    return this.isMuted
  }

  /**
   * リアルタイム応答を処理
   */
  private processRealtimeResponse(message: LiveServerMessage): void {
    // デバッグ: メッセージ全体を確認
    if (
      message.toolCall ||
      message.serverContent?.toolCall ||
      message.serverContent?.modelTurn?.toolCall
    ) {
      console.log('🔍 ツール関連メッセージ検出:', JSON.stringify(message, null, 2))
    }

    // ツール呼び出しの処理（音声処理より先に）
    if (message.toolCall) {
      console.log('🔧 ツール呼び出し:', message.toolCall.functionCalls)
      this.handleToolCalls(message.toolCall)
    }

    // ターン開始を検知
    if (message.serverContent?.modelTurn && !this.isProcessingTurn) {
      this.isProcessingTurn = true
      console.log('🎯 Geminiターン開始')
    }

    if (message.serverContent?.modelTurn?.parts) {
      const part = message.serverContent.modelTurn.parts[0]

      if (part?.inlineData?.mimeType && part.inlineData.data) {
        // 音声データをバッファに追加
        this.audioBuffer.push(part.inlineData.data)
        this.audioMimeType = part.inlineData.mimeType

        // 既存のタイマーをクリア
        if (this.bufferTimeout) {
          clearTimeout(this.bufferTimeout)
        }

        // 新しいタイマーを設定（一定時間後にバッファを処理）
        this.bufferTimeout = setTimeout(() => {
          this.flushAudioBuffer()
        }, this.BUFFER_DELAY)
      }

      if (part?.text) {
        console.log('📝 Geminiテキスト応答:', part.text)
      }
    }

    // ターン完了時はすぐにバッファをフラッシュ
    if (message.serverContent?.turnComplete) {
      console.log('✅ Geminiターン完了')
      this.isProcessingTurn = false

      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout)
      }
      // 少し待ってから最終フラッシュ（残りのデータが来る可能性があるため）
      setTimeout(() => {
        this.flushAudioBuffer()
      }, 10)
    }
  }

  /**
   * オーディオバッファをフラッシュして再生
   */
  private flushAudioBuffer(): void {
    if (this.audioBuffer.length === 0 || !this.audioMimeType) {
      return
    }

    // ミュート中はバッファをクリアして再生しない
    if (this.isMuted) {
      console.log('🔇 ミュート中のため音声を再生しません')
      this.audioBuffer = []
      this.audioMimeType = undefined
      return
    }

    // バッファ内のすべての音声データを結合してWAVに変換
    const wavBuffer = this.convertToWav(this.audioBuffer, this.audioMimeType)

    // コールバックで再生
    if (this.onAudioResponseCallback) {
      const dataSize = this.audioBuffer.reduce(
        (sum, data) => sum + Buffer.from(data, 'base64').length,
        0,
      )
      console.log(
        `🎵 音声バッファをフラッシュ (${this.audioBuffer.length}フラグメント, ${dataSize}バイト)`,
      )
      this.onAudioResponseCallback(wavBuffer)
    }

    // バッファをクリア
    this.audioBuffer = []
    this.audioMimeType = undefined
  }

  /**
   * ストリーミング開始
   */
  streamInit(mime: string = this.inputMime): void {
    this.inputMime = mime
    this.streamingActive = true
    console.log('🎙️ Geminiストリーミング開始')
  }

  /**
   * 20msフレームをそのまま送る
   */
  streamFrame(frame: Int16Array, sampleRate = 48000): void {
    if (!this.session || !this.streamingActive) return

    // PCMデータをbase64エンコード
    const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength)
    const base64 = buf.toString('base64')
    const mimeType = `audio/pcm;rate=${sampleRate}`

    this.session.sendRealtimeInput({
      audio: { data: base64, mimeType },
    })
  }

  /**
   * ストリーミング終了（発話区切り）
   */
  streamEnd(): void {
    if (!this.session) return
    this.session.sendRealtimeInput({ audioStreamEnd: true })
  }

  /**
   * ツール呼び出しを処理
   */
  private async handleToolCalls(toolCall: LiveServerToolCall): Promise<void> {
    if (!this.session) return

    for (const functionCall of toolCall.functionCalls || []) {
      const { name, args, id } = functionCall
      console.log(`🛠️ 関数呼び出し: ${name}`, args)

      let result: unknown

      switch (name) {
        case 'get_current_time':
          result = await this.getCurrentTime(args)
          break
        case 'get_mute_state':
          result = await this.getMuteState()
          break
        case 'enable_mute':
          result = await this.enableMute()
          break
        case 'disable_mute':
          result = await this.disableMute()
          break
        default:
          result = { error: `Unknown function: ${name}` }
      }

      // ツール応答を送信
      console.log(`📤 ツール応答送信: ${name}`, result)
      this.session.sendToolResponse({
        functionResponses: [
          {
            name,
            id,
            response: result,
          },
        ],
      })
    }
  }

  /**
   * 現在時刻を取得
   */
  private async getCurrentTime(_args: unknown): Promise<{ result: string }> {
    try {
      const now = new Date()

      // 日本時間で日時フォーマット
      const formatter = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'long',
      })

      const formattedDate = formatter.format(now)

      return {
        result: formattedDate, // シンプルなレスポンス形式
      }
    } catch (error) {
      return {
        result: `時刻取得エラー: ${error}`,
      }
    }
  }

  /**
   * ミュートを有効にする
   */
  private async enableMute(): Promise<{ result: string }> {
    this.isMuted = true
    console.log('🔇 ミュートモードが有効になりました')
    // 音声応答を返さない（ミュートなので）
    return {
      result: 'muted',
    }
  }

  /**
   * ミュートを解除する
   */
  private async disableMute(): Promise<{ result: string }> {
    this.isMuted = false
    console.log('🔊 ミュートモードが解除されました')
    return {
      result: 'ミュート解除しました。また話せます！',
    }
  }

  /**
   * ミュート状態を取得する
   */
  private async getMuteState(): Promise<{ result: { isMuted: boolean; status: string } }> {
    return {
      result: {
        isMuted: this.isMuted,
        status: this.isMuted ? 'ミュート中' : '通常モード',
      },
    }
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect(): void {
    // 最大試行回数を超えた場合は諦める
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Gemini再接続試行回数の上限に達しました')
      return
    }

    // すでに再接続がスケジュールされている場合はスキップ
    if (this.reconnectTimeout) {
      return
    }

    this.reconnectAttempts++
    const delay = this.RECONNECT_DELAY * this.reconnectAttempts // 段階的に遅延を増やす

    console.log(
      `⏳ ${delay / 1000}秒後にGeminiに再接続を試みます (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`,
    )

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = undefined
      try {
        await this.connect()
        console.log('✅ Gemini再接続成功')

        // 再接続後、ストリーミングモードを再開
        if (this.streamingActive) {
          this.streamInit(this.inputMime)
        }
      } catch (error) {
        console.error('❌ Gemini再接続失敗:', error)
        // 失敗したら再度スケジュール
        this.scheduleReconnect()
      }
    }, delay)
  }

  async disconnect(): Promise<void> {
    // 再接続タイマーをクリア
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    // クリーンアップ：タイマーをクリア
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
      this.flushAudioBuffer() // 残っているバッファを処理
    }

    if (this.session) {
      this.session.close()
      this.session = undefined
      this.connected = false
      this.streamingActive = false
    }
  }
}
