/**
 * WebReq — unified image / file loader.
 *
 *   const req = new WebReq({ url: 'foo.png', isBinary: false });
 *   req.onload = (r) => { ... };
 *   req.send();
 *
 * Tracks state 0→1→2→3→4→5. On error, calls onerror if set.
 */
export interface WebReqOptions {
  url: string;
  altUrl?: string;
  isBinary?: boolean;
  isJson?: boolean;
}

export type WebReqState = 0 | 1 | 2 | 3 | 4 | 5;

export interface WebReqResponse {
  url: string;
  currUrl: string;
  state: WebReqState;
  canceled: boolean;
  failedOnChromeBug: boolean;
  isJson: boolean;
  isBinary: boolean;
  image: HTMLImageElement | null;
  xhr: XMLHttpRequest | null;
  response: ArrayBuffer | string | null;
  progress: number;
  total: number;
  onload: ((r: WebReqResponse) => void) | null;
  onerror: ((r: WebReqResponse) => void) | null;
  send(): void;
  cancel(): void;
}

export function createWebReq(opts: WebReqOptions): WebReqResponse {
  const r: WebReqResponse = {
    url: opts.url,
    currUrl: opts.url,
    state: 0 as WebReqState,
    canceled: false,
    failedOnChromeBug: false,
    isJson: !!opts.isJson,
    isBinary: !!opts.isBinary,
    image: null,
    xhr: null,
    response: null,
    progress: 0,
    total: 0,
    onload: null,
    onerror: null,
    send() {
      try {
        r.state = 1 as WebReqState;
        const xhr = new XMLHttpRequest();
        r.xhr = xhr;
        xhr.open('GET', r.url, true);
        xhr.responseType = r.isBinary ? 'arraybuffer' : 'text';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            r.state = 5 as WebReqState;
            r.response = xhr.response;
            r.onload?.(r);
          } else {
            r.state = 4 as WebReqState;
            r.onerror?.(r);
          }
        };
        xhr.onerror = () => {
          r.state = 4 as WebReqState;
          r.onerror?.(r);
        };
        xhr.onprogress = (e) => {
          r.progress = e.loaded;
          r.total = e.total;
        };
        xhr.send();
      } catch (e) {
        r.state = 4 as WebReqState;
        r.onerror?.(r);
      }
    },
    cancel() {
      r.canceled = true;
      r.xhr?.abort();
    },
  };
  return r;
}
