import { File } from "./File";
import * as fs from 'fs';
import * as events from "events";
import * as os from 'os';

export class FileWatcher {

    readonly file: File;
    private watcher?: fs.FSWatcher;
    private selfWatcher?: fs.FSWatcher;
    private isDir: boolean;
    private recursive: boolean;
    private watchSelfDir: boolean;
    private _event: events.EventEmitter;

    OnRename?: (file: File) => void;
    OnChanged?: (file: File) => void;

    constructor(_file: File, _recursive: boolean = false, _watchSelfDir: boolean = true) {
        this.file = _file;
        this.recursive = _recursive;
        this.watchSelfDir = _watchSelfDir;
        this.isDir = this.file.IsDir();
        this._event = new events.EventEmitter();
    }

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: any, listener: (arg?: any) => void): this {
        this._event.on(event, listener);
        return this;
    }

    Watch(): this {

        //
        // see: http://nodejs.cn/api-v16/fs.html#caveats
        //
        if (this.watchSelfDir && this.isDir && os.platform() == 'win32' &&
            this.selfWatcher === undefined) {
            this.selfWatcher = fs.watch(this.file.dir, (event, fname) => {
                if (event === 'rename' && fname === this.file.name && this.OnRename) {
                    this.OnRename(this.file);
                }
            });
            this.selfWatcher.on('error', (err) => {
                const msg = `SelfWatcher: '${this.file.dir}' error, msg: '${(<Error>err).message}'`;
                this._event.emit('error', new Error(msg));
                this.Close();
            });
        }

        if (this.watcher === undefined) {
            this.watcher = fs.watch(this.file.path, { recursive: this.recursive }, (event, filename) => {
                switch (event) {
                    case 'rename':
                        if (this.OnRename) {
                            this.OnRename(this.isDir ? File.fromArray([this.file.path, filename]) : this.file);
                        }
                        break;
                    case 'change':
                        if (this.OnChanged) {
                            this.OnChanged(this.isDir ? File.fromArray([this.file.path, filename]) : this.file);
                        }
                        break;
                }
            });
            this.watcher.on('error', (err) => {
                const msg = `FileWatcher: '${this.file.path}' error, msg: '${(<Error>err).message}'`;
                this._event.emit('error', new Error(msg));
                this.Close();
            });
        }

        return this;
    }

    IsWatched(): boolean {
        return this.selfWatcher != undefined || this.watcher != undefined;
    }

    Close() {

        if (this.selfWatcher) {
            this.selfWatcher.close();
            this.selfWatcher = undefined;
        }

        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
        }
    }
}
