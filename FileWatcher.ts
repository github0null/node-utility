import { File } from "./File";
import * as fs from 'fs';
import * as events from "events";
import * as os from 'os';

const fw_global_evt = new events.EventEmitter();
const fw_global_evt_time_records = new Map<string, { [evt: string]: number }>();

function global_evt__emit(event: string, file: File) {

    let time_records = fw_global_evt_time_records.get(file.path);
    if (time_records && time_records[event] != undefined) {
        if (Date.now() - time_records[event] < 500) {
            return; // limit same event freq for a file
        }
    }

    // post event
    fw_global_evt.emit(event, file);

    if (time_records == undefined) {
        time_records = {};
    }

    time_records[event] = Date.now();
    fw_global_evt_time_records.set(file.path, time_records);
}

export class FileWatcher {

    readonly file: File;
    private watcher?: fs.FSWatcher;
    private selfWatcher?: fs.FSWatcher;
    private isDir: boolean;
    private recursive: boolean;
    private watchSelfDir: boolean;
    private _event: events.EventEmitter;

    ////////////////////
    // global event

    static on(event: 'change', listener: (file: File) => void): void;
    static on(event: 'rename', listener: (file: File) => void): void;
    static on(event: any, listener: (arg?: any) => void) {
        fw_global_evt.on(event, listener);
    }

    ////////////////////
    //

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

                if (fname === undefined || fname === null) {
                    const msg = `FileWatcher: '${event}' with null filename. on path: ${this.file?.dir}`;
                    this._event.emit('error', new Error(msg));
                    return;
                }

                if (event === 'rename') {
                    if (fname === this.file.name && this.OnRename) {
                        this.OnRename(this.file);
                    }
                    global_evt__emit(event, File.from(this.file.dir, fname));
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

                if (filename === undefined || filename === null) {
                    const msg = `FileWatcher: '${event}' with null filename. on path: ${this.file?.path}`;
                    this._event.emit('error', new Error(msg));
                    return;
                }

                switch (event) {
                    case 'rename':
                        if (this.OnRename) {
                            this.OnRename(this.isDir ? File.from(this.file.path, filename) : this.file);
                        }
                        break;
                    case 'change':
                        if (this.OnChanged) {
                            this.OnChanged(this.isDir ? File.from(this.file.path, filename) : this.file);
                        }
                        break;
                }

                global_evt__emit(event, this.isDir ? File.from(this.file.path, filename) : this.file);
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
