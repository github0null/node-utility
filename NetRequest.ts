import * as http from 'http';
import * as events from 'events';
import * as https from 'https';
import * as stream from 'stream';

export type HttpRequestType = 'http' | 'https';

export interface RequestOption<T> extends http.RequestOptions {
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

    Request<T, ResponseType>(option: RequestOption<T> | string, type?: HttpRequestType,
        report?: (receivedSize: number) => void): Promise<NetResponse<ResponseType>> {

        return new Promise((resolve) => {

            let resolved = false;

            if (typeof option !== 'string' && option.content) {
                option.method = 'GET';
            }

            try {
                const callbk: (res: http.IncomingMessage) => void = (res) => {

                    let data: string = '';

                    res.setEncoding('utf8');

                    res.on('error', (err) => {
                        this._event.emit('error', err);
                    });

                    res.on('close', () => {

                        if (!resolved) {

                            resolved = true;

                            if (res.statusCode && res.statusCode < 400) {

                                let content: ResponseType | undefined;

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

                    res.on('data', (buf) => {
                        data += buf;
                        if (report) {
                            report(data.length);
                        }
                    });
                };

                let request: http.ClientRequest;

                if (type !== 'https') {
                    request = http.request(option, callbk);
                } else {
                    request = https.request(option, callbk);
                }

                request.on('error', (err) => {

                    if (!resolved) {
                        resolved = true;
                        resolve({
                            success: false
                        });
                    }

                    this._event.emit('error', err);
                });

                if (typeof option !== 'string' && option.content) {
                    request.end(JSON.stringify(option.content));
                } else {
                    request.end();
                }
            } catch (error) {

                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false
                    });
                }

                this._event.emit('error', error);
            }
        });
    }

    RequestStream<T>(option: RequestOption<T> | string, writableStream: stream.Writable, type?: HttpRequestType, report?: (incrementSize: number) => void): Promise<boolean> {

        return new Promise((resolve) => {

            let request: http.ClientRequest;

            if (typeof option !== 'string' && option.content) {
                option.method = 'GET';
            }

            let resolved: boolean = false;
            const resolveIf = (state: boolean) => {
                if (!resolved) {
                    resolved = true;
                    resolve(state);
                }
            };

            try {
                if (type !== 'https') {
                    request = http.request(option);
                } else {
                    request = https.request(option);
                }

                request.on('error', (err) => {
                    this._event.emit('error', err);
                    resolveIf(false);
                });

                if (typeof option !== 'string' && option.content) {
                    request.end(JSON.stringify(option.content));
                } else {
                    request.end();
                }

                if (report) {
                    request.connection.on('data', (buf) => {
                        report(buf.length);
                    });
                }

                const ref = request.pipe(writableStream);

                ref.on('error', (err) => {
                    this._event.emit('error', err);
                    resolveIf(false);
                });

                ref.on('close', () => {
                    resolveIf(true);
                });
            } catch (error) {
                this._event.emit('error', error);
                resolveIf(false);
            }
        });
    }
}