import * as process from 'child_process';
import * as events from 'events';
import * as ReadLine from 'readline';
import { EOL } from 'os';

export type ExecutableOption = { encoding?: string | null } & process.ExecFileOptions
    | process.ForkOptions | process.ExecOptions;

export interface Executable {

    Run(exePath: string, args?: string[], options?: ExecutableOption): void;

    Kill(signal?: NodeJS.Signals | number): void;

    IsExit(): boolean;

    write(chunk: any): Promise<Error | undefined | null>;

    remove(event: any, lisenter: any): void;

    on(event: 'data', listener: (data: string) => void): this;

    on(event: 'launch', listener: (launchOk?: boolean) => void): this;

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
    protected launchDelay: number;

    private _exited: boolean;

    constructor(delay?: number) {
        this.launchDelay = delay ? delay : 10;
        this._event = new events.EventEmitter();
        this._exited = true;
    }

    on(event: 'launch', listener: () => void): this;
    on(event: 'close', listener: (exitInfo: ExitInfo) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'data', listener: (data: string) => void): this;
    on(event: 'line', listener: (line: string) => void): this;
    on(event: 'errLine', listener: (line: string) => void): this;
    on(event: any, listener: (argc?: any) => void) {
        this._event.on(event, listener);
        return this;
    }

    pid(): number | undefined {
        return this.proc?.pid;
    }

    remove(event: any, lisenter: any): void {
        this._event.removeListener(event, lisenter);
    }

    write(chunk: any): Promise<Error | undefined | null> {
        return new Promise((resolve) => {
            try {
                const proc = <process.ChildProcess>this.proc;
                if (proc.stdin) {
                    proc.stdin.write(chunk, (err) => {
                        resolve(err);
                    });
                } else {
                    resolve(new Error('write failed !, \'stdin\' is null'));
                }
            } catch (error) {
                resolve(error);
            }
        });
    }

    Run(exe_or_cmd: string, args?: string[] | undefined, options?: ExecutableOption | undefined): void {

        if (!this._exited) {
            throw new Error('process has not exited !');
        }

        this.proc = this._execute(exe_or_cmd, args, options);

        this._exited = false;

        if (this.proc.stdout) {

            this.proc.stdout.setEncoding((<any>options)?.encoding || this.codeType);
            this.proc.stdout.on('data', (data: string) => {
                this._event.emit('data', data);
            });

            // line
            const stdout = ReadLine.createInterface({ input: this.proc.stdout });
            stdout.on('line', (line) => {
                this._event.emit('line', line);
            });
        }

        if (this.proc.stderr) {

            this.proc.stderr.setEncoding((<any>options)?.encoding || this.codeType);
            this.proc.stderr.on('data', (data: string) => {
                this._event.emit('data', data);
            });

            // line
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
            this._event.emit('launch', !proc.killed);
        }, this.launchDelay, this.proc);
    }

    SendText(str: string): boolean {

        if (this.proc && this.proc.stdin) {

            this.proc.stdin.write(str + EOL);

            return true;
        }

        return false;
    }

    async Kill(signal?: NodeJS.Signals | number): Promise<void> {
        const sig = signal || Process.killSignal;
        return new Promise((resolve) => {
            if (this.proc && !this.proc.killed) {
                this._event.once('close', (exitInfo: ExitInfo) => {
                    resolve();
                    if (exitInfo.signal !== sig) {
                        this._event.emit('error', new Error('Process killed with error signal !'));
                    }
                });
                this.proc.kill(sig);
            } else {
                resolve();
            }
        });
    }

    IsExit(): boolean {
        return this._exited;
    }

    protected abstract _execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess;
}

export class ExeFile extends Process {

    protected _execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        return process.execFile(exePath, args, options);
    }
}

export class ExeCmd extends Process {

    protected _execute(command: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        if (args) {
            command += ' ' + args.join(' ');
        }
        return process.exec(command, <process.ExecOptions>options);
    }
}

export class ExeModule extends Process {

    protected _execute(exePath: string, args?: string[] | undefined, options?: ExecutableOption | undefined): process.ChildProcess {
        return process.fork(exePath, args, options);
    }
}