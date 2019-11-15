import { File } from "./File";
import * as fs from 'fs';

export class FileWatcher {

    readonly file: File;
    private watcher: fs.FSWatcher | undefined;
    private isDir: boolean;
    private recursive: boolean;

    OnRename?: (file: File) => void;
    OnChanged?: (file: File) => void;

    constructor(_file: File, _recursive: boolean = false) {
        this.file = _file;
        this.recursive = _recursive;
        this.isDir = this.file.IsDir();
    }

    Watch(): this {
        if (this.watcher === undefined) {
            this.watcher = fs.watch(this.file.path, { encoding: 'utf8', recursive: this.recursive }, (event, filename) => {
                switch (event) {
                    case 'rename':
                        if (this.OnRename) {
                            this.OnRename(this.isDir ? File.CreateFromArray([this.file.path, filename]) : this.file);
                        }
                        break;
                    case 'change':
                        if (this.OnChanged) {
                            this.OnChanged(this.isDir ? File.CreateFromArray([this.file.path, filename]) : this.file);
                        }
                        break;
                }
            });
            this.watcher.on('error', (err) => {
                throw err;
            });
        }
        return this;
    }

    Close() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
        }
    }
}
