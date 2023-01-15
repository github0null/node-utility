import * as fs from 'fs';
import { File } from './File';

const lockedFiles: Map<number, string> = new Map();

export function lock(fpath: string): number | undefined {

    try {

        if (File.IsExist(fpath)) {
            fs.unlinkSync(fpath);
        }

        const fd = fs.openSync(fpath, 'wx');

        lockedFiles.set(fd, fpath);

        return fd;

    } catch (error) {
        // lock failed
    }
}

export function unlock(fpath_or_fd: string | number): boolean {

    try {

        let target_fd: number | undefined;

        for (const kv of lockedFiles) {

            const t_fd   = kv[0];
            const t_path = kv[1];

            if (typeof fpath_or_fd == 'string') {

                if (t_path == fpath_or_fd) {
                    fs.closeSync(t_fd);
                    target_fd = t_fd;
                    break;
                }

            } else if (typeof fpath_or_fd == 'number') {

                if (t_fd == fpath_or_fd) {
                    fs.closeSync(t_fd);
                    target_fd = t_fd;
                    break;
                }
            }
        }

        if (target_fd) {
            lockedFiles.delete(target_fd);
            return true;
        }

    } catch (error) {
        // unlock failed
    }

    return false;
}
