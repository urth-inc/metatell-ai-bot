declare module 'draco3dgltf' {
  interface DracoModule {
    createDecoderModule(): Promise<unknown>
  }

  const draco: DracoModule
  export default draco
}
