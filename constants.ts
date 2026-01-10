import { Message, MessageCategory, Sentiment, ResponseCost, Channel, BusinessPolicy } from './types';

export const INITIAL_POLICIES: BusinessPolicy[] = [
  {
    id: '1',
    title: 'Shipping Policy',
    content: 'We ship worldwide via DHL Express. Standard processing time is 1-2 business days. Domestic shipping is free for orders over $50. International shipping starts at $15. Tracking numbers are emailed automatically upon dispatch.'
  },
  {
    id: '2',
    title: 'Returns & Refunds',
    content: 'We accept returns within 30 days of delivery. Items must be unused and in original packaging. Return shipping is covered by the customer unless the item arrived damaged. Refunds are processed to the original payment method within 5-7 business days of receipt.'
  },
  {
    id: '3',
    title: 'Custom Orders',
    content: 'We love custom orders! Customization fees start at $20. Please allow an extra 3-5 business days for production. Custom items are non-refundable.'
  }
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'm1',
    senderName: 'Sarah Jenkins',
    senderHandle: '@sarahj_crafts',
    channel: Channel.Instagram,
    body: 'Hey! I ordered the ceramic vase (Order #9921) last week but haven\'t received a tracking number yet. Is it on its way?',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    isRead: false,
    isReplied: false,
    category: MessageCategory.Shipping,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: ['Order Status', 'Tracking']
  },
  {
    id: 'm2',
    senderName: 'Mike Ross',
    senderHandle: 'mike.ross@example.com',
    channel: Channel.Email,
    subject: 'Damaged Item Received',
    body: 'I am very disappointed. My package arrived today and the vintage lamp is completely shattered. I need a refund immediately or I will file a chargeback.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isRead: false,
    isReplied: false,
    category: MessageCategory.Complaint,
    sentiment: Sentiment.Negative,
    predictedCost: ResponseCost.High,
    tags: ['Damaged', 'Refund', 'Urgent']
  },
  {
    id: 'm3',
    senderName: 'EtsyBuyer_99',
    senderHandle: 'Etsy Message',
    channel: Channel.Etsy,
    body: 'Hi there, do you do these customized with initials? I want to get one for my wedding party.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    isRead: true,
    isReplied: false,
    category: MessageCategory.Custom,
    sentiment: Sentiment.Positive,
    predictedCost: ResponseCost.Medium,
    tags: ['Custom Request', 'Wedding']
  },
  {
    id: 'm4',
    senderName: 'Shopify Notifier',
    senderHandle: 'System',
    channel: Channel.Shopify,
    body: 'New order #10234 placed by John Doe. Total: $125.00',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isRead: true,
    isReplied: true,
    category: MessageCategory.General,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: ['Notification']
  },
  {
    id: 'm5',
    senderName: 'David Chen',
    senderHandle: 'david.c@gmail.com',
    channel: Channel.Email,
    subject: 'Tracking info?',
    body: 'Hello, I haven\'t gotten my tracking number yet for order #9925. Can you please check?',
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 mins ago
    isRead: false,
    isReplied: false,
    category: MessageCategory.Shipping,
    sentiment: Sentiment.Neutral,
    predictedCost: ResponseCost.Low,
    tags: ['Tracking', 'Order Status']
  },
  {
    id: 'm6',
    senderName: 'Lisa Kudrow',
    senderHandle: '@phoebe',
    channel: Channel.Instagram,
    body: 'Can I add custom text to the mug? It is for a birthday.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    isRead: false,
    isReplied: false,
    category: MessageCategory.Custom,
    sentiment: Sentiment.Positive,
    predictedCost: ResponseCost.Medium,
    tags: ['Custom Request', 'Birthday']
  }
];