import { Message, MessageCategory, ResponseCost } from '../types';

export function filterMessagesBySearch(messages: Message[], search: string): Message[] {
  if (!search) return messages;
  const lower = search.toLowerCase();
  return messages.filter(m =>
    m.senderName.toLowerCase().includes(lower) ||
    m.body.toLowerCase().includes(lower) ||
    m.subject.toLowerCase().includes(lower)
  );
}

export function filterMessagesByFeature(
  messages: Message[],
  options: {
    categories?: MessageCategory[];
    urgencies?: ResponseCost[];
  } = {}
): Message[] {
  return messages.filter(msg => {
    const categoryMatch = options.categories && options.categories.length > 0 
      ? options.categories.includes(msg.category) 
      : true;
    const urgencyMatch = options.urgencies && options.urgencies.length > 0 
      ? options.urgencies.includes(msg.predictedCost) 
      : true;
    return categoryMatch && urgencyMatch;
  });
}