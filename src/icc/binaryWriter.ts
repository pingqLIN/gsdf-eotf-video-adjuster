export class BinaryWriter {
  private bytes: number[] = [];

  get offset(): number {
    return this.bytes.length;
  }

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u16(value: number): void {
    this.u8(value >> 8);
    this.u8(value);
  }

  u32(value: number): void {
    this.u8(value >> 24);
    this.u8(value >> 16);
    this.u8(value >> 8);
    this.u8(value);
  }

  i32(value: number): void {
    this.u32(value >>> 0);
  }

  ascii(value: string, length = value.length): void {
    for (let index = 0; index < length; index += 1) {
      this.u8(index < value.length ? value.charCodeAt(index) : 0);
    }
  }

  bytesOf(values: Uint8Array | readonly number[]): void {
    for (const value of values) {
      this.u8(value);
    }
  }

  s15Fixed16(value: number): void {
    this.i32(Math.round(value * 65536));
  }

  pad4(): void {
    while (this.offset % 4 !== 0) {
      this.u8(0);
    }
  }

  patchU32(offset: number, value: number): void {
    this.bytes[offset] = (value >> 24) & 0xff;
    this.bytes[offset + 1] = (value >> 16) & 0xff;
    this.bytes[offset + 2] = (value >> 8) & 0xff;
    this.bytes[offset + 3] = value & 0xff;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
