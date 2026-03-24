import { createHash } from 'node:crypto';
import { createMessage } from '../../domain/factories.js';
import type { Message } from '../../domain/types.js';

export function parseSmsXml(xmlText: string): Message[] {
  const trimmed = xmlText.trim();
  if (!trimmed.startsWith('<')) {
    throw new Error('Malformed XML');
  }

  const nodes = [...trimmed.matchAll(/<sms\s+([^>]+?)\s*\/?>(?:<\/sms>)?/g)];
  if (nodes.length === 0 && /<smses/.test(trimmed)) return [];
  if (nodes.length === 0) throw new Error('Malformed XML');

  return nodes.map((node) => {
    const attrs = node[1];
    const get = (name: string): string => {
      const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return match?.[1] ?? '';
    };

    const type = get('type');
    const body = get('body');
    const address = get('address');
    const dateSent = Number(get('date_sent') || get('date'));

    if (!dateSent || Number.isNaN(dateSent)) {
      throw new Error('Malformed XML: missing date_sent');
    }

    const direction = type === '2' ? 'sent' : 'received';

    return createMessage({
      threadId: createHash('sha1').update(address).digest('hex'),
      dateTime: new Date(dateSent),
      sender: direction === 'sent' ? 'you' : 'landlord',
      direction,
      body,
      importSource: 'sms-xml'
    });
  });
}
