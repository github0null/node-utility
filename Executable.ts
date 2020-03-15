import * as process from 'child_process';
import * as events from 'events';
import * as ReadLine from 'readline';
import { EOL } from 'os';

export type ExecutableOption = { encoding?: string | null } & process.ExecFileOptions
    | process.ForkOptions | process.ExecOptions;

export interface Executable {

    Run(exePath: string, args?: string[], options?: ExecutableOption): void;

    Kill(): void;

    IsExit(): boolean;

    on(event: 'launch', listener: () => void): this;

    on(event: 'close', listener: (exitInfo: ExitInfo) => void): this;

    on(event: 'error', listener: (err: Error) => void): this;

    on(event: 'line', listener: (line: string) => void): this;

    on(event: 'errLine', listener: (line: string) => void): this;
}

export interface ExitInfo {
    code: number;
    signal: string;
}

export abstract class Process implements Executable {

    static killSignal: NodeJS.Signals = 'SIGKILL';

    protected readonly codeType = 'utf8';

    protected _event: events.EventEmitter;
    protected proc: process.ChildProcess | undefined;
    protected launchTimeout: number;

    private _exited: boolean;

    constructor(timeout?: number) {
        this.launchTimeout = timeout ? timeout : 0;
        this._event = new events.EventEmitter();
        this._exited = true;
    }

    Run(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): void {

        if (!this._exited) {
            this._event.emit('error', new Error('process has not exited !'));
            return;
        }

        this.proc = this.Execute(exePath, args, options);

        this._exited = false;

        if (this.proc.stdout) {
            this.proc.stdout.setEncoding((<any>options)?.encoding || this.codeType);
            const stdout = ReadLine.createInterface({ input: this.proc.stdout });
            stdout.on('line', (line) => {
                this._event.emit('line', line);
            });
        }

        if (this.proc.stderr) {
            this.proc.stderr.setEncoding((<any>options)?.encoding || this.codeType);
            const stderr = ReadLine.createInterface({ input: this.proc.stderr });
            stderr.on('line', (line) => {
                this._event.emit('errLine', line);
            });
        }

        this.proc.on('error', (err) => {
            this._event.emit('error', err);
        });

        this.proc.on('close', (code, signal) => {
            this._event.emit('close', <ExitInfo>{
                code: code,
                signal: signal
            });
            this._exited = true;
        });

        setTimeout((proc: process.ChildProcess) => {
            if (!proc.killed) {
                this._event.emit('launch');
            }
        }, this.launchTimeout, this.proc);
    }

    SendText(str: string): boolean {

        if (this.proc && this.proc.stdin) {

            this.proc.stdin.write(str + EOL);

            return true;
        }

        return false;
    }

    async Kill(): Promise<void> {
        return new Promise((resolve) => {
            if (this.proc && !this.proc.killed) {
                this._event.once('close', (exitInfo: ExitInfo) => {
                    resolve();
                    if (exitInfo.signal !== Process.killSignal) {
                        this._event.emit('error', new Error('Process killed with error signal !'));
                    }
                });
                this.proc.kill(Process.killSignal);
            } else {
                resolve();
            }
        });
    }

    IsExit(): boolean {
        return this._exited;
    }

    on(event: "launch", listener: () => void): this;
    on(event: "close", listener: (exitInfo: ExitInfo) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: "line", listener: (line: string) => void): this;
    on(event: "errLine", listener: (line: string) => void): this;
    on(event: any, listener: (argc?: any) => void) {
        this._event.on(event, listener);
        return this;
    }

    protected abstract Execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess;
}

export class ExeFile extends Process {

    protected Execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        return process.execFile(exePath, args, options);
    }
}

export class ExeCmd extends Process {

    protected Execute(command: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        if (args) {
            command += ' ' + args.join(' ');
        }
        return process.exec(command, <process.ExecOptions>options);
    }
}

export class ExeModule extends Process {

    protected Execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        return process.fork(exePath, args, options);
    }
}