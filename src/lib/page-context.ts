export type PageType = 'ecommerce' | 'article' | 'search' | 'form' | 'generic';

export interface StructuredData {
  prices: string[];
  dates: string[];
  headings: string[];
  emailCount: number;
}

export interface PageContext {
  url: string;
  title: string;
  metaDescription: string;
  pageType: PageType;
  textContent: string;
  links: Array<{ text: string; href: string }>;
  forms: Array<{ id: string; action: string; fieldCount: number; fields: string[] }>;
  structuredData: StructuredData;
  tokenEstimate: number;
}

function classifyPageType(url: string, doc: Document): PageType {
  const href = url.toLowerCase();
  const text = doc.body?.innerText?.toLowerCase() || '';

  // E-commerce: price patterns, cart buttons, product schemas
  const pricePattern = /\$\d+\.?\d{0,2}|\d+\.\d{2}\s*(usd|eur|gbp)/i;
  const hasCart = !!doc.querySelector('[class*="cart"], [class*="add-to"], [data-action*="cart"], button[name*="cart"]');
  const hasPrices = pricePattern.test(text);
  if ((hasPrices && hasCart) || href.includes('/product') || href.includes('/item') || href.includes('/dp/')) {
    return 'ecommerce';
  }

  // Article: <article> tag, long paragraphs
  const hasArticle = !!doc.querySelector('article, [class*="article"], [class*="post-content"]');
  const paragraphs = doc.querySelectorAll('p');
  const longParas = Array.from(paragraphs).filter((p) => (p.textContent?.length || 0) > 200);
  if (hasArticle || longParas.length >= 3) return 'article';

  // Search: search-related URL patterns, result lists
  if (href.includes('search') || href.includes('q=') || href.includes('query=')) return 'search';

  // Form-heavy
  const forms = doc.querySelectorAll('form');
  const totalInputs = doc.querySelectorAll('input, textarea, select').length;
  if (forms.length >= 1 && totalInputs >= 4) return 'form';

  return 'generic';
}

function extractStructuredData(text: string, doc: Document): StructuredData {
  // Prices
  const priceMatches = text.match(/\$[\d,]+\.?\d{0,2}/g) || [];
  const prices = [...new Set(priceMatches)].slice(0, 20);

  // Dates
  const datePattern = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{0,4}/gi;
  const dateMatches = text.match(datePattern) || [];
  const dates = [...new Set(dateMatches)].slice(0, 10);

  // Headings
  const headingEls = doc.querySelectorAll('h1, h2, h3');
  const headings = Array.from(headingEls)
    .map((el) => el.textContent?.trim() || '')
    .filter((h) => h.length > 0 && h.length < 200)
    .slice(0, 15);

  // Count emails but don't store them (privacy restraint)
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailCount = (text.match(emailPattern) || []).length;

  return { prices, dates, headings, emailCount };
}

export function extractPageContext(): PageContext {
  const doc = document;
  const url = window.location.href;
  const title = doc.title || '';
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';

  // Get text content — truncate for safety
  let rawText = doc.body?.innerText || '';
  // Mask any password fields content (restraint)
  const passwordFields = doc.querySelectorAll('input[type="password"]');
  passwordFields.forEach(() => {
    rawText = rawText.replace(/password[:\s]*\S+/gi, 'password: [MASKED]');
  });
  const textContent = rawText.slice(0, 20000);
  const truncatedText = rawText.slice(0, 5000);

  // Links — up to 20
  const linkEls = doc.querySelectorAll('a[href]');
  const links = Array.from(linkEls)
    .map((a) => ({
      text: (a.textContent?.trim() || '').slice(0, 100),
      href: (a as HTMLAnchorElement).href,
    }))
    .filter((l) => l.text.length > 0 && l.href.startsWith('http'))
    .slice(0, 20);

  // Forms — up to 5
  const formEls = doc.querySelectorAll('form');
  const forms = Array.from(formEls).slice(0, 5).map((form) => {
    const inputs = form.querySelectorAll('input, textarea, select');
    const fields = Array.from(inputs)
      .map((input) => {
        const el = input as HTMLInputElement;
        // Never expose password values
        if (el.type === 'password') return `${el.name || el.id || 'password'} [password field]`;
        return el.name || el.id || el.type || 'unnamed';
      })
      .slice(0, 10);

    return {
      id: form.id || form.name || 'unnamed',
      action: form.action || '',
      fieldCount: inputs.length,
      fields,
    };
  });

  const structuredData = extractStructuredData(textContent, doc);
  const tokenEstimate = Math.ceil(truncatedText.length / 4);

  return {
    url,
    title,
    metaDescription: metaDesc,
    pageType: classifyPageType(url, doc),
    textContent: truncatedText,
    links,
    forms,
    structuredData,
    tokenEstimate,
  };
}

export function summarizeForLLM(context: PageContext, maxTokens: number = 2000): string {
  const parts: string[] = [];

  parts.push(`Page: ${context.title}`);
  parts.push(`URL: ${context.url}`);
  parts.push(`Type: ${context.pageType}`);

  if (context.metaDescription) {
    parts.push(`Description: ${context.metaDescription}`);
  }

  if (context.structuredData.headings.length > 0) {
    parts.push(`\nHeadings:\n${context.structuredData.headings.map((h) => `- ${h}`).join('\n')}`);
  }

  if (context.structuredData.prices.length > 0) {
    parts.push(`\nPrices found: ${context.structuredData.prices.join(', ')}`);
  }

  if (context.links.length > 0) {
    parts.push(`\nKey links:\n${context.links.slice(0, 10).map((l) => `- ${l.text}: ${l.href}`).join('\n')}`);
  }

  if (context.forms.length > 0) {
    parts.push(`\nForms: ${context.forms.map((f) => `${f.id} (${f.fieldCount} fields)`).join(', ')}`);
  }

  // Add text content up to token budget
  const headerTokens = Math.ceil(parts.join('\n').length / 4);
  const remainingTokens = maxTokens - headerTokens;
  if (remainingTokens > 100) {
    const charBudget = remainingTokens * 4;
    parts.push(`\nPage text:\n${context.textContent.slice(0, charBudget)}`);
  }

  return parts.join('\n');
}
