/**
 * Client for the Legistar Web API (Granicus).
 *
 * Public, read-only OData REST API for municipal legislative data.
 * Base: https://webapi.legistar.com/v1/{client}/
 * Docs: https://webapi.legistar.com/Help
 *
 * Supports pagination ($top/$skip, max 1000/page) and OData filtering.
 */

import {
  LegistarPerson,
  LegistarBody,
  LegistarEvent,
  LegistarEventItem,
  LegistarVote,
  LegistarMatter,
  LegistarSponsor,
} from './types';

const BASE = 'https://webapi.legistar.com/v1';

async function fetchJson(url: string, retries = 3): Promise<any> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error(`Legistar API returned ${resp.status} — an API token may be required`);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e: any) {
      lastError = e;
      if (e.message.includes('401') || e.message.includes('403')) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchAll(url: string): Promise<any[]> {
  const results: any[] = [];
  let skip = 0;
  const top = 1000;

  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const page = await fetchJson(`${url}${sep}$top=${top}&$skip=${skip}`);
    if (!page || !Array.isArray(page) || page.length === 0) break;
    results.push(...page);
    if (page.length < top) break;
    skip += top;
  }
  return results;
}

export class LegistarClient {
  private base: string;

  constructor(private clientName: string) {
    this.base = `${BASE}/${clientName}`;
  }

  async getPersons(): Promise<LegistarPerson[]> {
    return fetchAll(`${this.base}/persons`);
  }

  async findPerson(name: string): Promise<LegistarPerson | null> {
    const persons = await this.getPersons();
    const lower = name.toLowerCase();
    return (
      persons.find(p => (p.PersonFullName || '').toLowerCase().includes(lower)) ??
      persons.find(p => lower.includes((p.PersonFullName || '').toLowerCase())) ??
      null
    );
  }

  async getBodies(): Promise<LegistarBody[]> {
    return fetchAll(`${this.base}/bodies`);
  }

  async getEvents(opts?: { bodyId?: number; dateFrom?: string; dateTo?: string }): Promise<LegistarEvent[]> {
    const filters: string[] = [];
    if (opts?.bodyId) filters.push(`EventBodyId eq ${opts.bodyId}`);
    if (opts?.dateFrom) filters.push(`EventDate ge datetime'${opts.dateFrom}'`);
    if (opts?.dateTo) filters.push(`EventDate lt datetime'${opts.dateTo}'`);

    let url = `${this.base}/events?$orderby=EventDate desc`;
    if (filters.length) url += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
    return fetchAll(url);
  }

  async getEventItems(eventId: number): Promise<LegistarEventItem[]> {
    return fetchAll(`${this.base}/events/${eventId}/eventitems`);
  }

  async getEventItemVotes(eventItemId: number): Promise<LegistarVote[]> {
    return fetchAll(`${this.base}/eventitems/${eventItemId}/votes`);
  }

  async getMatters(opts?: { dateFrom?: string; dateTo?: string }): Promise<LegistarMatter[]> {
    const filters: string[] = [];
    if (opts?.dateFrom) filters.push(`MatterIntroDate ge datetime'${opts.dateFrom}'`);
    if (opts?.dateTo) filters.push(`MatterIntroDate lt datetime'${opts.dateTo}'`);

    let url = `${this.base}/matters?$orderby=MatterIntroDate desc`;
    if (filters.length) url += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
    return fetchAll(url);
  }

  async getMatterSponsors(matterId: number): Promise<LegistarSponsor[]> {
    return fetchAll(`${this.base}/matters/${matterId}/sponsors`);
  }
}
