import {
  GoogleGenAI,
  type LiveServerMessage,
  MediaResolution,
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
  private isConnected = false

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey })
  }

  async connect(): Promise<void> {
    if (this.isConnected) return

    //const model = 'models/gemini-2.5-flash-preview-native-audio-dialog'
    const model = 'models/gemini-2.5-flash-live-preview'
    const config = {
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          languageCode: 'ja-JP',
          prebuiltVoiceConfig: {
            voiceName: 'Kore',
          },
        },
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
      },
    }

    this.session = await this.ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          console.log('✅ Gemini音声対話接続成功')
          this.isConnected = true
        },
        onmessage: (message: LiveServerMessage) => {
          this.responseQueue.push(message)
        },
        onerror: (e: unknown) => {
          console.error('❌ Gemini接続エラー:', e)
        },
        onclose: (e: CloseEvent) => {
          console.log('🔌 Gemini接続終了:', e.reason || e.code)
          this.isConnected = false
        },
      },
      config,
    })
  }

  async sendAudio(audioData: Buffer, mimeType: string = 'audio/wav'): Promise<Buffer | null> {
    if (!this.session || !this.isConnected) {
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

  async disconnect(): Promise<void> {
    if (this.session) {
      this.session.close()
      this.session = undefined
      this.isConnected = false
    }
  }
}
