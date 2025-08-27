import * as http from 'http';
import * as events from 'events';
import * as https from 'https';
import { URL } from "url";

export type HttpRequestType = 'http' | 'https';

export interface RequestOption<T> extends http.RequestOptions, https.RequestOptions {
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

    emit(event: 'abort'): boolean;
    emit(event: any, arg?: any): boolean {
        return this._event.emit(event, arg);
    }

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: any, listener: (argc?: any) => void): this {
        this._event.on(event, listener);
        return this;
    }

    /**
     * @note request json object by http/https GET method
     */
    Request<T, ResponseType>(option: RequestOption<T> | string, type?: HttpRequestType,
        report?: (receivedSize: number) => void): Promise<NetResponse<ResponseType>> {

        return new Promise((resolve) => {

            if (typeof option !== 'string' && option.content) {
                option.method = 'GET';
            }

            let resolved: boolean = false;
            const resolveIf = (res?: NetResponse<ResponseType>) => {
                if (!resolved) {
                    resolved = true;
                    resolve(<any>res);
                }
            };

            const callbk: (res: http.IncomingMessage) => void = (res) => {

                let data: string = '';
                res.setEncoding('utf8');

                this._event.on('abort', () => {
                    if (!res.destroyed) {
                        res.destroy();
                    }
                });

                res.on('error', (err) => {
                    this._event.emit('error', err);
                });

                res.on('data', (buf) => {
                    data += buf;
                    if (report) {
                        report(data.length);
                    }
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode < 300) {
                        try {
                            const content = JSON.parse(data);
                            resolveIf({
                                success: true,
                                statusCode: res.statusCode,
                                content: content,
                                msg: res.statusMessage
                            });
                        } catch (err) {
                            resolveIf({
                                success: false,
                                statusCode: res.statusCode,
                                msg: res.statusMessage
                            });
                        }
                    } else {
                        resolveIf({
                            success: false,
                            statusCode: res.statusCode,
                            msg: res.statusMessage
                        });
                    }
                });
                
                res.on('close', () => {
                    resolveIf({
                        success: false,
                        statusCode: res.statusCode,
                        msg: 'request closed, but data not end !'
                    });
                });
            };

            try {

                let request: http.ClientRequest;

                if (type !== 'https') {
                    request = http.request(option, callbk);
                } else {
                    request = https.request(option, callbk);
                }

                this._event.on('abort', () => {
                    if (!request.destroyed) {
                        request.destroy();
                    }
                });

                request.on('error', (err) => {
                    resolveIf({ success: false });
                    this._event.emit('error', err);
                });

                request.on('timeout', () => {
                    if (!request.aborted) {
                        request.abort();
                    }
                });

                if (typeof option !== 'string' && option.content) {
                    request.end(JSON.stringify(option.content));
                } else {
                    request.end();
                }
            } catch (error) {
                resolveIf({
                    success: false
                });
                this._event.emit('error', error);
            }
        });
    }
    
    /**
     * @note request txt content by http/https GET method
     */
    RequestTxt<T>(option: RequestOption<T> | string, type?: HttpRequestType,
        report?: (receivedSize: number) => void): Promise<NetResponse<string>> {

        return new Promise((resolve) => {

            if (typeof option !== 'string' && option.content) {
                option.method = 'GET';
            }

            let resolved: boolean = false;
            const resolveIf = (res?: NetResponse<string>) => {
                if (!resolved) {
                    resolved = true;
                    resolve(<any>res);
                }
            };

            const callbk: (res: http.IncomingMessage) => void = (res) => {

                let data: string = '';
                res.setEncoding('utf8');

                this._event.on('abort', () => {
                    if (!res.destroyed) {
                        res.destroy();
                    }
                });

                res.on('error', (err) => {
                    this._event.emit('error', err);
                });

                res.on('data', (buf) => {
                    data += buf;
                    if (report) {
                        report(data.length);
                    }
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode < 300) {
                        resolveIf({
                            success: true,
                            statusCode: res.statusCode,
                            content: data,
                            msg: res.statusMessage
                        });
                    } else {
                        resolveIf({
                            success: false,
                            statusCode: res.statusCode,
                            msg: res.statusMessage
                        });
                    }
                });
                
                res.on('close', () => {
                    resolveIf({
                        success: false,
                        statusCode: res.statusCode,
                        msg: 'request closed, but data not end !'
                    });
                });
            };

            try {

                let request: http.ClientRequest;

                if (type !== 'https') {
                    request = http.request(option, callbk);
                } else {
                    request = https.request(option, callbk);
                }

                this._event.on('abort', () => {
                    if (!request.destroyed) {
                        request.destroy();
                    }
                });

                request.on('error', (err) => {
                    resolveIf({ success: false });
                    this._event.emit('error', err);
                });

                request.on('timeout', () => {
                    if (!request.aborted) {
                        request.abort();
                    }
                });

                if (typeof option !== 'string' && option.content) {
                    request.end(JSON.stringify(option.content));
                } else {
                    request.end();
                }
            } catch (error) {
                resolveIf({
                    success: false
                });
                this._event.emit('error', error);
            }
        });
    }

    /**
     * @note request binary data by http/https GET method
     */
    RequestBinary<T>(
        url_or_option: RequestOption<T> | URL, 
        type?: HttpRequestType, 
        report?: (incrementPercent: number) => void, 
        redirect_count?: number): Promise<NetResponse<Buffer>> {

        return new Promise((resolve) => {

            let bufferList: Buffer[] = [];
            let isAbort = false;
            let isRedirected = redirect_count && redirect_count > 0;

            if (!(url_or_option instanceof URL)) {
                url_or_option.method = 'GET';
            }

            let resolved: boolean = false;
            const resolveIf = (res: NetResponse<Buffer>) => {
                if (!resolved) {
                    resolved = true;
                    resolve(res);
                }
            };

            const callbk: (res: http.IncomingMessage) => void = (res) => {

                res.on('error', (err) => {
                    this._event.emit('error', err);
                });

                this._event.on('abort', () => {
                    if (!res.destroyed) {
                        isAbort = true;
                        res.destroy();
                    }
                });

                const totalSize = parseInt(res.headers['content-length'] || '');

                res.on('data', (buf: Buffer) => {
                    bufferList.push(buf);
                    if (report && totalSize) {
                        report(buf.length / totalSize);
                    }
                });

                res.on('end', () => {
                    if (res.statusCode == 301 || res.statusCode == 302) {
                        const loc = res.headers.location;
                        if (redirect_count && redirect_count > 5) {
                            resolveIf({
                                success: false,
                                statusCode: 400,
                                msg: `Bad redirect: max jumps (>5) of redirect reached. stop at ${loc}`
                            });
                        } else if (loc) {
                            const nUrl = new URL(loc);
                            let hdrs: any = { 'User-Agent': 'Mozilla/5.0' };
                            if (!(url_or_option instanceof URL))
                                if (url_or_option.headers)
                                    hdrs = url_or_option.headers;
                            isRedirected = true;
                            this.RequestBinary({
                                host: nUrl.host,
                                path: nUrl.pathname,
                                headers: hdrs
                            }, type, report, (redirect_count || 0) + 1)
                                .then(rsp => {
                                    resolveIf(rsp);
                                }).catch(err => {
                                    resolveIf({
                                        success: false,
                                        statusCode: res.statusCode,
                                        msg: `Error: ${(<Error>err).message}`
                                    });
                                });
                        } else {
                            resolveIf({
                                success: false,
                                statusCode: 404,
                                msg: `Bad redirect: location is null`
                            });
                        }
                    } else if (`${res.statusCode}`.startsWith('20') && !isAbort) {
                        resolveIf({
                            success: true,
                            statusCode: res.statusCode,
                            msg: res.statusMessage,
                            content: Buffer.concat(bufferList)
                        });
                    } else {
                        resolveIf({
                            success: !isAbort,
                            statusCode: res.statusCode,
                            msg: res.statusMessage
                        });
                    }
                });

                res.on('close', () => {
                    if (!isRedirected)
                        resolveIf({
                            success: false,
                            statusCode: res.statusCode,
                            msg: 'request closed, but data not end !'
                        });
                });
            };

            let request: http.ClientRequest;

            try {
                if (type !== 'https') {
                    request = http.request(url_or_option, callbk);
                } else {
                    request = https.request(url_or_option, callbk);
                }

                this._event.on('abort', () => {
                    if (!request.destroyed) {
                        isAbort = true;
                        request.destroy();
                    }
                });

                request.on('error', (err) => {
                    this._event.emit('error', err);
                    resolveIf({
                        success: false
                    });
                });

                request.on('timeout', () => {
                    if (!request.aborted) {
                        request.abort();
                    }
                });

                if (!(url_or_option instanceof URL)) {
                    request.end(JSON.stringify(url_or_option.content));
                } else {
                    request.end();
                }

            } catch (error) {
                this._event.emit('error', error);
                resolveIf({
                    success: false
                });
            }
        });
    }
}