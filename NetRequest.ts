import * as http from 'http';
import * as events from 'events';

export interface RequestOption<T> {
    host: string;
    port: number;
    path?: string;
    timeOut?: number;
    content?: T;
}

export interface NetResponse<T> {
    success: boolean;
    statusCode?: number;
    content?: T;
    msg?: string;
    location?: string;
}

export class NetRequest {

    private _event: events.EventEmitter;

    constructor() {
        this._event = new events.EventEmitter();
    }

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: any, listener: (argc?: any) => void): this {
        this._event.on(event, listener);
        return this;
    }

    Request<T>(option: RequestOption<T>): Promise<NetResponse<T>> {

        return new Promise((resolve) => {

            let resolved = false;
            let _method = option.content ? 'POST' : 'GET';

            let request = http.request({
                protocol: 'http:',
                host: option.host,
                port: option.port,
                path: option.path,
                method: _method,
                timeout: option.timeOut
            }, (res) => {

                let data: string = '';

                res.setEncoding('utf8');
                res.on('data', (buf) => {
                    data += buf;
                });

                res.on('error', (err) => {
                    this._event.emit('error', err);
                });

                res.on('close', () => {

                    if (!resolved) {

                        resolved = true;

                        if (res.statusCode && res.statusCode < 400) {

                            let content: T | undefined;

                            if (res.statusCode === 302 || res.statusCode === 301) {

                                resolve({
                                    success: false,
                                    statusCode: res.statusCode,
                                    location: res.headers.location,
                                    msg: res.statusMessage
                                });
                            } else {

                                try {
                                    content = JSON.parse(data);
                                    resolve({
                                        success: true,
                                        statusCode: res.statusCode,
                                        content: content,
                                        msg: res.statusMessage
                                    });
                                } catch (err) {
                                    resolve({
                                        success: false,
                                        statusCode: res.statusCode,
                                        msg: res.statusMessage
                                    });
                                }
                            }
                        } else {
                            resolve({
                                success: false,
                                statusCode: res.statusCode,
                                msg: res.statusMessage
                            });
                        }
                    }
                });
            });

            request.on('error', (err) => {

                if (!resolved) {

                    resolved = true;

                    resolve({
                        success: false
                    });
                }

                this._event.emit('error', err);
            });

            if (_method === 'POST') {

                request.end(JSON.stringify(option.content));

            } else {

                request.end();
            }
        });
    }
}