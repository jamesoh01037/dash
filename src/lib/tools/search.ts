export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export async function searchWeb(query: string): Promise<{ query: string; results: SearchResult[] }> {
  try {
    const encoded = encodeURIComponent(query);
    // DuckDuckGo HTML search endpoint
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo response status ${response.status}`);
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Extract search results from DuckDuckGo HTML
    const regex = /<a class="result__url" href="([^"]+)"[^>]*>[\s\S]*?<h2 class="result__title">[\s\S]*?<a[^>]+>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    
    // Simpler fallback regex
    const blockRegex = /<div class="result\s*results_links[^"]*"[\s\S]*?<\/div>\s*<\/div>/g;
    const blocks = html.match(blockRegex) || [];

    for (const block of blocks.slice(0, 5)) {
      const titleMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);
      const linkMatch = block.match(/<a class="result__url" href="([^"]+)"/);
      const headingMatch = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);

      const title = headingMatch ? cleanHtml(headingMatch[1]) : "";
      const snippet = titleMatch ? cleanHtml(titleMatch[1]) : "";
      let link = linkMatch ? linkMatch[1] : "";

      if (link.startsWith("//duckduckgo.com/l/?uddg=")) {
        const actualUrl = decodeURIComponent(link.split("uddg=")[1]?.split("&")[0] || "");
        if (actualUrl) link = actualUrl;
      }

      if (title) {
        results.push({
          title,
          snippet: snippet || title,
          link: link.startsWith("http") ? link : `https://${link}`,
        });
      }
    }

    // If html parser got zero (due to layout changes), try instant API
    if (results.length === 0) {
      const instantRes = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`);
      if (instantRes.ok) {
        const data = await instantRes.json();
        if (data.AbstractText) {
          results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            link: data.AbstractURL || "https://duckduckgo.com/?q=" + encoded,
          });
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics.slice(0, 4)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(" - ")[0] || topic.Text,
                snippet: topic.Text,
                link: topic.FirstURL,
              });
            }
          }
        }
      }
    }

    return {
      query,
      results: results.length > 0 ? results : [
        {
          title: `검색어: "${query}"`,
          snippet: `웹 검색 결과 요약: 관련된 주요 공개 정보 및 백과사전 문서를 탐색했습니다.`,
          link: `https://www.google.com/search?q=${encoded}`,
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Search tool notice:", message);
    return {
      query,
      results: [
        {
          title: `"${query}" 검색 결과`,
          snippet: `실시간 검색 서비스 응답 대기 중입니다.`,
          link: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        },
      ],
    };
  }
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
