import * as Path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as url from 'url';

export class File {

    static sep = Path.sep;
    static delimiter = Path.delimiter;
    static EXCLUDE_ALL_FILTER: RegExp[] = [];

    readonly name: string;          // example 'demo.cpp'
    readonly noSuffixName: string;  // example 'demo'
    readonly suffix: string;        // example '.cpp'
    readonly dir: string;           // example 'd:\\dir'
    readonly path: string;          // example 'd:\\dir\\demo.cpp'

    constructor(filePath: string) {
        this.path = filePath;
        this.name = Path.basename(this.path);
        this.noSuffixName = this.GetNoSuffixName(this.name);
        this.suffix = Path.extname(this.path);
        this.dir = Path.dirname(this.path);
    }

    static from(...paths: string[]): File {
        return new File(Path.join.apply(null, paths));
    }

    /**
     * @deprecated this function is replaced by File.from(...)
    */
    static fromArray(pathArray: string[]): File {
        return new File(Path.join.apply(null, pathArray));
    }

    /**
     * same as 'NodePath.normalize', but we not convert '${VAR}/../A' to 'A'
    */
    static normalize(path_: string, sep?: string): string {

        let path = path_.trim();

        let root: string = '';

        if (Path.isAbsolute(path)) {
            root = Path.parse(path).root;
            if (this.sep == '\\') root = root.replace(/\//, '\\');
            path = path.substr(root.length);
        }

        const p = path.split(/\\|\//)
            .map(n => n.trim())
            .filter(n => n != '' && n != '.');

        let parts: string[] = [];

        p.forEach(n => {

            if (n != '..') {
                parts.push(n);
                return;
            }

            const l = parts.pop();

            if (l == undefined) {
                parts.push(n);
                return;
            }

            if (l == '..' ||
                l.startsWith('${') ||
                l.startsWith('$(')) {
                parts.push(l, n);
                return;
            }

            // 'l' and '..' (l/..) are counteracted
        });

        if (parts.length == 0)
            return root ? root : '.';

        return root + parts.join(sep || File.sep);
    }

    /**
     * convert path string to unix style
     * 
     * @param path the path must not contain any 'env variables', like: '${DIR_N}, ${VAR1}', 
     * because we will use `normalize` function to format path
     */
    static ToUnixPath(path: string): string {
        if (this.sep == '\\') { // in win32 platform
            return File.normalize(path).replace(/\\{1,}/g, '/');
        } else { // in unix platform
            if (path.includes('\\')) { // it's a win32 path
                return File.normalize(path.replace(/\\{1,}/g, '/'));
            } else {
                return File.normalize(path);
            }
        }
    }

    static ToUri(path: string): string {
        return url.pathToFileURL(path).toString();
    }

    static ToNoProtocolUri(path: string): string {
        return url.pathToFileURL(path).pathname;
    }

    // c:/abcd/../a -> c:\abcd\..\a
    static ToLocalPath(path: string): string {

        const res = File.ToUnixPath(path);

        if (File.sep === '\\') {
            return res.replace(/\//g, File.sep);
        }

        return res;
    }

    static isAbsolute(path: string): boolean {
        return Path.isAbsolute(path)
            || File.isAbsoluteEnvPath(path);
    }

    static isAbsoluteEnvPath(path: string): boolean {
        return path.startsWith('$(')
            || path.startsWith('${');
    }

    static isEnvPath(path: string): boolean {
        return path.includes('$(')
            || path.includes('${');
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

    static IsExist(path: string): boolean {
        return fs.existsSync(path);
    }

    static IsFile(path: string): boolean {
        return fs.existsSync(path) && fs.statSync(path).isFile();
    }

    static IsDir(path: string): boolean {
        return fs.existsSync(path) && fs.statSync(path).isDirectory();
    }

    static isSubPathOf(root_: string, target_: string): boolean {

        const target = File.ToUnixPath(target_).replace(/\/$/, '');
        const root = File.ToUnixPath(root_).replace(/\/$/, '');

        if (root == target) return true;

        return target.startsWith(`${root}/`);
    }

    //---------

    private GetNoSuffixName(name: string): string {
        const nList = this.name.split('.');
        if (nList.length > 1) {
            nList.pop();
            return nList.join('.');
        } else {
            return name;
        }
    }

    private _CopyRetainDir(baseDir: File, file: File) {

        const relativePath = baseDir.ToRelativePath(file.dir);

        if (relativePath) {

            const dir = File.fromArray([this.path, relativePath.replace(/\//g, File.sep)]);
            if (!dir.IsDir()) {
                this.CreateDir(true);
            }
            fs.copyFileSync(file.path, dir.path + File.sep + file.name);
        }
    }

    isSubPathOf(root_: string): boolean {
        return File.isSubPathOf(root_, this.path);
    }


    ToRelativeLocalPath(abspath: string): string | undefined {

        if (File.isAbsoluteEnvPath(abspath)) { // env path have no repath
            return undefined;
        }

        if (!File.isAbsolute(abspath)) {
            return undefined;
        }

        const rePath = Path.relative(this.path, abspath);
        if (File.isAbsolute(rePath)) {
            return undefined;
        }

        if (rePath === '') {
            return '.';
        }

        return rePath;
    }

    /**
     * example: 
     *      this.path:  'd:\app\abc\.', 
     *      absPath:    'd:\app\abc\.\def\a.c', 
     *      result:     'def/a.c'
    */
    ToRelativePath(abspath: string): string | undefined {
        const rePath = this.ToRelativeLocalPath(abspath);
        if (rePath) {
            return File.ToUnixPath(rePath);
        }
    }

    //----------------------------------------------------

    CreateDir(recursive: boolean = false): void {

        if (this.IsDir())
            return; // skip existed folder

        if (recursive) { // create parent folder
            const parts = this.path.split(/(?:\\|\/)+/);
            if (parts.length > 0) {
                let _path: string = parts[0]; // set root
                for (let i = 1; i < parts.length; i++) {
                    _path += (Path.sep + parts[i]);
                    if (File.IsDir(_path)) continue; // skip existed folder
                    fs.mkdirSync(_path);
                }
            }
        }

        else {
            fs.mkdirSync(this.path);
        }
    }

    GetList(fileFilter?: RegExp[], dirFilter?: RegExp[]): File[] {

        const list: File[] = [];

        if (!this.IsDir())
            return list;

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
        this._CopyRetainDir(baseDir, file);
    }

    CopyFile(file: File) {
        fs.copyFileSync(file.path, this.path + File.sep + file.name);
    }

    CopyList(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        let fList = dir.GetList(fileFilter, dirFilter);
        fList.forEach(f => {
            if (f.IsFile()) {
                this.CopyRetainDir(dir, f);
            }
        });
    }

    CopyAllFile(dir: File, fileFilter?: RegExp[], dirFilter?: RegExp[]) {
        let fList = dir.GetAll(fileFilter, dirFilter);
        fList.forEach(f => {
            if (f.IsFile()) {
                this.CopyRetainDir(dir, f);
            }
        });
    }

    //-------------------------------------------------

    Read(encoding?: string): string {
        return fs.readFileSync(this.path, encoding || 'utf8');
    }

    Write(str: string, options?: fs.WriteFileOptions) {
        fs.writeFileSync(this.path, str, options);
    }

    IsExist(): boolean {
        return fs.existsSync(this.path);
    }

    IsFile(): boolean {
        return fs.existsSync(this.path) && fs.statSync(this.path).isFile();
    }

    IsDir(): boolean {
        return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
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
        return url.pathToFileURL(this.path).toString();
    }

    ToNoProtocolUri(): string {
        return url.pathToFileURL(this.path).hostname;
    }
}