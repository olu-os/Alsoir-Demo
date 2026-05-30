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
    'http_req_failed{name:Homepage}':         ['rate<0.01'],
    'http_req_failed{name:Categorize}':       ['rate<0.05'],
    'http_req_failed{name:GenerateDraft}':    ['rate<0.05'],
  },
};

const SUPABASE = 'https://stdjjjdpukinmngrlejh.functions.supabase.co';
// TODO: move to k6/secrets — import secrets from 'k6/secrets'; const ANON_KEY = await secrets.get('supabase_anon_key');
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0ZGpqamRwdWtpbm1uZ3JsZWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mzc2MjcsImV4cCI6MjA4MzQxMzYyN30.X-vpG1MyE8u1zZvHTsCl4PtTPTey7t5ln2XU5Xgc2aA';
const VERCEL = 'https://alsoir.vercel.app';

const headers = {
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

const messages = [
  { name: 'Sarah Johnson', text: 'My order #12345 arrived damaged. The box was crushed and the product inside is broken. I need a replacement ASAP.' },
  { name: 'Mike Chen',     text: 'I want to cancel my subscription. I was charged yesterday and I no longer need the service. Please process a refund.' },
  { name: 'Emily Davis',   text: "Do you have the blue sweater in size M? It's been out of stock for weeks and I keep checking." },
  { name: 'Carlos Rivera', text: 'I was charged twice for the same order. Two separate payments came out of my account.' },
  { name: 'Aisha Patel',   text: 'Can I change my shipping address? I moved and my package is going to the old place.' },
  { name: 'Tom Baker',     text: 'How long does standard shipping usually take? I need it by Friday.' },
  { name: 'Lisa Kim',      text: "I want to return the shoes I bought last week. They don't fit. What's your return policy?" },
  { name: 'James Wilson',  text: "Is there a discount code for first-time customers? I'm looking to place a large order." },
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

  sleep(3);
}