import * as Path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class File {

    static sep = Path.sep;
    static delimiter = Path.delimiter;
    static EMPTY_FILTER: RegExp[] = [];

    readonly name: string;          // example 'demo.cpp'
    readonly noSuffixName: string;  // example 'demo'
    readonly suffix: string;        // example '.cpp'
    readonly dir: string;           // example 'd:\\dir'
    readonly path: string;          // example 'd:\\dir\\demo.cpp'

    constructor(fPath: string) {
        this.path = fPath;
        this.name = Path.basename(fPath);
        this.noSuffixName = this.GetNoSuffixName(this.name);
        this.suffix = Path.extname(fPath);
        this.dir = Path.dirname(fPath);
    }

    static CreateFromArray(pathArray: string[]): File {
        return new File(pathArray.join(File.sep));
    }

    static ToUnixPath(path: string): string {
        return this.DelRepeatedPath(path.replace(/\\{1,}/g, '/'));
    }

    static ToLocalPath(path: string): string {

        const res = File.ToUnixPath(path);

        if (File.sep === '\\') {
            return res.replace(/\//g, File.sep);
        }

        return res;
    }

    // ./././aaaa/././././bbbb => ./aaaa/bbbb
    private static DelRepeatedPath(path: string) {
        return path.replace(/^\.\//g, '#')
            .replace(/(?:\.\/){1,}/g, '')
            .replace(/^#/, './');
    }

    private static _match(str: string, isInverter: boolean, regList: RegExp[]): boolean {

        let isMatch: boolean = false;

        for (let reg of regList) {
            if (reg.test(str)) {
                isMatch = true;
                break;
            }
        }

        if (isInverter) {
            isMatch = !isMatch;
        }

        return isMatch;
    }

    private static _filter(fList: File[], isInverter: boolean, fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {

        const res: File[] = [];

        if (fileFilter) {
            fList.forEach(f => {
                if (f.IsFile() && this._match(f.name, isInverter, fileFilter)) {
                    res.push(f);
                }
            });
        } else {
            fList.forEach(f => {
                if (f.IsFile()) {
                    res.push(f);
                }
            });
        }

        if (dirFilter) {
            fList.forEach(f => {
                if (f.IsDir() && this._match(f.name, isInverter, dirFilter)) {
                    res.push(f);
                }
            });
        } else {
            fList.forEach(f => {
                if (f.IsDir()) {
                    res.push(f);
                }
            });
        }

        return res;
    }

    static Filter(fList: File[], fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        return this._filter(fList, false, fileFilter, dirFilter);
    }

    static NotMatchFilter(fList: File[], fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        return this._filter(fList, true, fileFilter, dirFilter);
    }

    private GetNoSuffixName(name: string): string {
        const nList = this.name.split('.');
        if (nList.length > 1) {
            nList.pop();
            return nList.join('.');
        } else {
            return name;
        }
    }

    private _Copy(file: File) {
        fs.copyFileSync(file.path, this.path + File.sep + file.name);
    }

    private ThrowIfNotDir(dir: File) {
        if (!this.IsDir()) {
            throw new Error('directory is not exist, [Path] : ' + dir.path);
        }
    }

    private ThrowIfNotFile(file: File) {
        if (!file.IsFile()) {
            throw new Error('file is not exist, [Path] : ' + file.path);
        }
    }

    private _CopyRetainDir(baseDir: File, file: File) {

        const relativePath = baseDir.ToRelativePath(file.dir);

        if (relativePath) {

            const dir = File.CreateFromArray([this.path, relativePath.replace(/\//g, File.sep)]);
            if (!dir.IsDir()) {
                this.CreateDir(true);
            }
            fs.copyFileSync(file.path, dir.path + File.sep + file.name);
        }
    }

    /**
     * example: this.path: 'd:\app\abc\.', absPath: 'd:\app\abc\.\def\a.c', result: './def/a.c'
    */
    ToRelativePath(path: string): string | undefined {

        const root = File.ToUnixPath(this.path).replace(/\/\s*$/, '');
        const abspath = File.ToUnixPath(path);

        if (root.length >= abspath.length) {
            return undefined;
        }

        if (abspath.startsWith(root)) {
            return '.' + abspath.substr(root.length);
        }

        return undefined;
    }

    //----------------------------------------------------

    CreateDir(recursive: boolean = false): void {
        if (recursive) {
            let list = this.path.split(Path.sep);
            let f: File;
            if (list.length > 0) {
                let dir: string = list[0];
                for (let i = 0; i < list.length;) {
                    f = new File(dir);
                    if (!f.IsDir()) {
                        fs.mkdirSync(f.path);
                    }
                    dir += ++i < list.length ? (Path.sep + list[i]) : '';
                }
                return;
            }
            return;
        }
        fs.mkdirSync(this.path);
    }

    GetList(fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        let list: File[] = [];
        fs.readdirSync(this.path).forEach((str: string) => {
            if (str !== '.' && str !== '..') {
                const f = new File(this.path + Path.sep + str);
                if (f.IsDir()) {
                    if (dirFilter) {
                        for (let reg of dirFilter) {
                            if (reg.test(f.name)) {
                                list.push(f);
                                break;
                            }
                        }
                    } else {
                        list.push(f);
                    }
                } else {
                    if (fileFilter) {
                        for (let reg of fileFilter) {
                            if (reg.test(f.name)) {
                                list.push(f);
                                break;
                            }
                        }
                    } else {
                        list.push(f);
                    }
                }
            }
        });
        return list;
    }

    GetAll(fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {
        let res: File[] = [];

        let fStack: File[] = this.GetList(fileFilter);
        let f: File;

        while (fStack.length > 0) {
            f = <File>fStack.pop();
            if (f.IsDir()) {
                fStack = fStack.concat(f.GetList(fileFilter));
            }
            res.push(f);
        }

        return File.Filter(res, undefined, dirFilter);
    }

    CopyRetainDir(baseDir: File, file: File) {
        this.ThrowIfNotDir(baseDir);
        this.ThrowIfNotFile(file);
        this.ThrowIfNotDir(this);
        this._CopyRetainDir(baseDir, file);
    }

    CopyFile(file: File) {
        this.ThrowIfNotFile(file);
        this.ThrowIfNotDir(this);
        this._Copy(file);
    }

    CopyList(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        this.ThrowIfNotDir(dir);
        this.ThrowIfNotDir(this);
        let fList = dir.GetList(fileFilter, dirFilter);
        fList.forEach(f => {
            if (f.IsFile()) {
                this.CopyRetainDir(dir, f);
            }
        });
    }

    CopyAll(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        this.ThrowIfNotDir(dir);
        this.ThrowIfNotDir(this);
        let fList = dir.GetAll(fileFilter, dirFilter);
        fList.forEach(f => {
            if (f.IsFile()) {
                this.CopyRetainDir(dir, f);
            }
        });
    }

    //-------------------------------------------------

    Read(encoding?: string): string {
        return fs.readFileSync(this.path, {
            encoding: encoding || 'utf8'
        });
    }

    Write(str: string) {
        fs.writeFileSync(this.path, str);
    }

    IsExist(): boolean {
        return fs.existsSync(this.path);
    }

    IsFile(): boolean {
        if (fs.existsSync(this.path)) {
            return fs.lstatSync(this.path).isFile();
        }
        return false;
    }

    IsDir(): boolean {
        if (fs.existsSync(this.path)) {
            return fs.lstatSync(this.path).isDirectory();
        }
        return false;
    }

    getHash(hashName?: string): string {
        const hash = crypto.createHash(hashName || 'md5');
        hash.update(fs.readFileSync(this.path));
        return hash.digest('hex');
    }

    getSize(): number {
        return fs.statSync(this.path).size;
    }

    ToUri(): string {
        return 'file://' + this.ToNoProtocolUri();
    }

    ToNoProtocolUri(): string {
        return '/' + this.path.replace(new RegExp(Path.sep + Path.sep, 'g'), '/');
    }
}