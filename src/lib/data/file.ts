import fs from "fs";
import LineReader from 'n-readlines';
import { URL } from "url";
import { CsvStream } from "./csv";

export class DataFile<T extends readonly any[]> {

  #url: URL;
  public constructor(url: URL) {
    this.#url = url;
  }

  public readArray(): T {
    if (!fs.existsSync(this.#url)) {
      throw new Error(`Data file doesn't exist yet; run engine to create: ${this.#url}`);
    }

    return CsvStream.readFileFromFile(this.readLines()) as T;
  }

  public readLines(): Iterator<string> & Iterable<string> {
    const reader = new LineReader(this.#url);
    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): { done: boolean, value: string } {
        const buf = reader.next();
        if (!buf) return { done: true, value: '' };
        return { done: false, value: buf.toString('utf8') }
      },
    };
  }

  public writeArray(array: T) {
    const csv = this.writeCsvStream();
    csv.writeArrayToFile(array);
    csv.close();
  }

  public writeStream(): LogWriteStream {
    const fd = fs.openSync(this.#url, 'w');
    return {
      writeLine: (text) => fs.writeSync(fd, text + '\n'),
      close: () => fs.closeSync(fd),
    };
  }

  public writeCsvStream(): CsvStream {
    return new CsvStream(this.writeStream());
  }

}

export interface LogWriteStream {
  writeLine(text: string): void;
  close(): void;
}
