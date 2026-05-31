import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  scenarios: {
    ramp_up_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 3 },
        { duration: '1m',  target: 10 },
        { duration: '30s', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:Homepage}':       ['p(95)<2000'],
    'http_req_duration{name:Categorize}':     ['p(95)<2000'],
    'http_req_duration{name:GenerateDraft}':  ['p(95)<2000'],
    'http_req_duration{name:FindSimilar}':    ['p(95)<5000'],
    'http_req_failed{name:Homepage}':         ['rate<0.01'],
    'http_req_failed{name:Categorize}':       ['rate<0.05'],
    'http_req_failed{name:GenerateDraft}':    ['rate<0.05'],
    'http_req_failed{name:FindSimilar}':      ['rate<0.05'],
  },
};

const SUPABASE = 'https://stdjjjdpukinmngrlejh.functions.supabase.co';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const VERCEL = 'https://alsoir.vercel.app';

const headers = {
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

const messages = [
  // --- Late / damaged shipments (group 1) ---
  { id: 'damaged-1', name: 'Sarah Johnson', text: 'My order #12345 arrived damaged. The box was crushed and the product inside is broken. I need a replacement ASAP.' },
  { id: 'damaged-2', name: 'Tom Baker',     text: 'My package finally came but the item is cracked. I want a replacement or a refund. This is unacceptable.' },
  { id: 'damaged-3', name: 'Nina Okafor',   text: 'Order #20931 showed up with a broken seal. The product looks used. Please send a new one.' },
  { id: 'damaged-4', name: 'David Kim',     text: 'My delivery was left in the rain and the packaging is ruined. Can I get a replacement shipped? ' },
  // --- Cancellations / refunds (group 2) ---
  { id: 'cancel-1', name: 'Mike Chen',     text: 'I want to cancel my subscription. I was charged yesterday and I no longer need the service. Please process a refund.' },
  { id: 'cancel-2', name: 'Emma Walsh',    text: 'I need to cancel my recurring order before it ships next week. Also request a refund for the last charge.' },
  { id: 'cancel-3', name: 'Raj Patel',     text: 'Please cancel my account and refund my last payment. I no longer require your services.' },
  // --- Stock / availability (group 3) ---
  { id: 'stock-1',  name: 'Emily Davis',   text: "Do you have the blue sweater in size M? It's been out of stock for weeks and I keep checking." },
  { id: 'stock-2',  name: 'Chris Mwangi',  text: 'When will the leather tote bag be back in stock? I need it by next month for a gift.' },
  // --- Billing / overcharges (group 4) ---
  { id: 'billing-1', name: 'Carlos Rivera', text: 'I was charged twice for the same order. Two separate payments came out of my account.' },
  { id: 'billing-2', name: 'Lena Schmidt',  text: 'You billed me $89 but the website said $69. Please correct this overcharge immediately.' },
  // --- Address / shipping changes (group 5) ---
  { id: 'addr-1', name: 'Aisha Patel',   text: 'Can I change my shipping address? I moved and my package is going to the old place.' },
  { id: 'addr-2', name: 'Omar Hassan',   text: 'I accidentally put the wrong zip code on my order. Can you update it before it ships?' },
  // --- Shipping speed queries (group 6) ---
  { id: 'speed-1', name: 'James Wilson',  text: 'How long does standard shipping usually take? I need it by Friday.' },
  { id: 'speed-2', name: 'Sophie Turner', text: 'Is there expedited shipping available? I need this delivered by Thursday.' },
  // --- Returns / exchanges (group 7) ---
  { id: 'return-1', name: 'Lisa Kim',      text: "I want to return the shoes I bought last week. They don't fit. What's your return policy?" },
  { id: 'return-2', name: 'Maria Garcia',  text: 'The sweater I ordered is too small. Can I exchange it for a large? What do I need to do?' },
  { id: 'return-3', name: 'John Smith',    text: "I received the wrong color. How do I return this and get the correct one? I'm disappointed." },
  // --- General inquiries (group 8) ---
  { id: 'general-1', name: 'Olivia Brown',  text: "Is there a discount code for first-time customers? I'm looking to place a large order." },
  { id: 'general-2', name: 'Liam O Brien',  text: 'Do you offer gift wrapping? I want to send this directly to a friend as a present.' },
];

const policies = [
  { title: 'Return Policy',       content: 'Returns accepted within 30 days. Item must be unused. Refund processed within 5-7 business days.' },
  { title: 'Shipping Policy',     content: 'Standard shipping takes 3-5 business days. Express shipping takes 1-2 business days.' },
  { title: 'Cancellation Policy', content: 'Subscriptions can be cancelled anytime. Refunds prorated for unused portion.' },
];

function sample(arr, n) {
  return arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
}

export default function () {
  const msg    = messages[Math.floor(Math.random() * messages.length)];
  const policy = sample(policies, 2);

  group('Homepage', function () {
    const res = http.get(`${VERCEL}/`, { tags: { name: 'Homepage' } });
    check(res, {
      'homepage 200': (r) => r.status === 200,
    });
  });

  group('Categorize', function () {
    const res = http.post(
      `${SUPABASE}/groq/categorize`,
      JSON.stringify({ text: msg.text }),
      { headers, timeout: '30s', tags: { name: 'Categorize' } }
    );

    let body;
    try { body = res.json(); } catch { body = null; }
    const category = body?.category || 'unknown';

    check(res, {
      'categorize 200':    (r) => r.status === 200,
      'category returned': () => !!body?.category,
    });
    console.log(`Categorized "${msg.text.slice(0, 40)}..." as "${category}"`);
  });

  sleep(1);

  group('GenerateDraft', function () {
    const res = http.post(
      `${SUPABASE}/groq/generate-draft`,
      JSON.stringify({
        messageText:   msg.text,
        senderName:    msg.name,
        policies:      policy,
        businessName:  'Alsoir Shop',
        signature:     'Best, Support Team',
        aiPersonality: 'support',
      }),
      { headers, timeout: '30s', tags: { name: 'GenerateDraft' } }
    );

    let body;
    try { body = res.json(); } catch { body = null; }
    const draftText = body?.draft || '';

    check(res, {
      'draft 200':      (r) => r.status === 200,
      'draft returned': () => draftText.length > 0,
    });
    console.log(`Draft for ${msg.name}: "${draftText.slice(0, 60)}..."`);
  });

  group('FindSimilar', function () {
    const target = { id: msg.id, body: msg.text };
    const candidates = messages
      .filter(m => m.id !== msg.id)
      .slice(0, 4)
      .map(m => ({ id: m.id, body: m.text }));
    const res = http.post(
      `${SUPABASE}/groq/find-similar`,
      JSON.stringify({ target, candidates }),
      { headers, timeout: '30s', tags: { name: 'FindSimilar' } }
    );
    let body;
    try { body = res.json(); } catch { body = null; }
    check(res, {
      'find-similar 200': (r) => r.status === 200,
      'find-similar ids': () => Array.isArray(body?.similarIds),
    });
    const ids = body?.similarIds || [];
    const preview = ids.map(id => (id || '').slice(0, 10)).join(', ');
    console.log(`FindSimilar "${msg.id}" → ${ids.length} similar [${preview}]`);
  });

  sleep(3);
}