declare module "mailparser" {
  export interface AddressObject {
    value: Array<{ address: string; name: string }>;
    text: string;
  }

  export interface ParsedMail {
    text?: string;
    html?: string;
    subject?: string;
    from?: AddressObject;
    to?: AddressObject | AddressObject[];
    date?: Date;
    attachments?: Array<{
      filename?: string;
      contentType: string;
      content: Buffer;
      size: number;
    }>;
  }

  export function simpleParser(
    source: string | Buffer | NodeJS.ReadableStream,
    options?: any
  ): Promise<ParsedMail>;
}
