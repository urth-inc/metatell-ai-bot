declare module 'commander' {
  export class Command {
    constructor(name?: string)
    name(name: string): this
    description(desc: string): this
    version(v: string): this
    option(flags: string, description?: string, defaultValue?: unknown): this
    action(fn: (...args: unknown[]) => unknown): this
    parse(argv?: readonly string[]): this
    parseAsync(argv?: readonly string[]): Promise<this>
  }
}
