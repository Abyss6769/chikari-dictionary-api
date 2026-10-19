export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const word = url.searchParams.get("word");

    if (!word) {
      return new Response(
        JSON.stringify({ error: "Word parameter is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanWord = word.trim().toLowerCase();

    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    try {
      let definition = "";
      let partOfSpeech = "";
      let phonetic = "";
      let audio = "";
      let synonyms = [];

      // Datamuse API
      try {
        const datamuseRes = await fetch(
          `https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=dp&max=1`
        );
        if (datamuseRes.ok) {
          const data = await datamuseRes.json();
          if (data && data.length > 0 && data[0].defs && data[0].defs.length > 0) {
            const rawDef = data[0].defs[0];
            const tabIndex = rawDef.indexOf("\t");

            if (tabIndex !== -1) {
              const posTag = rawDef.substring(0, tabIndex).trim();
              definition = rawDef.substring(tabIndex + 1).trim();

              const posMap = {
                n: "noun",
                v: "verb",
                adj: "adjective",
                adv: "adverb",
                u: "unknown",
              };
              partOfSpeech = posMap[posTag] || posTag;
            } else {
              definition = rawDef;
            }
          }
        }

        const synRes = await fetch(
          `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}&max=5`
        );
        if (synRes.ok) {
          const synData = await synRes.json();
          if (Array.isArray(synData)) {
            synonyms = synData.map((s) => s.word);
          }
        }
      } catch (e) {}

      // Free Dictionary API
      try {
        const dictRes = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`
        );
        if (dictRes.ok) {
          const dictData = await dictRes.json();
          if (Array.isArray(dictData) && dictData.length > 0) {
            const entry = dictData[0];
            phonetic = entry.phonetic || "";

            if (entry.phonetics && Array.isArray(entry.phonetics)) {
              for (const p of entry.phonetics) {
                if (!phonetic && p.text) phonetic = p.text;
                if (p.audio && !audio) {
                  audio = p.audio;
                }
              }
            }

            if (!definition && entry.meanings && entry.meanings.length > 0) {
              const firstMeaning = entry.meanings[0];
              if (!partOfSpeech) partOfSpeech = firstMeaning.partOfSpeech || "";

              if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
                definition = firstMeaning.definitions[0].definition || "";
              }

              if (synonyms.length === 0 && firstMeaning.synonyms) {
                synonyms = [...new Set(firstMeaning.synonyms)].slice(0, 5);
              }
            }
          }
        }
      } catch (e) {}

      if (!definition) {
        return new Response(
          JSON.stringify({ error: `Definition for '${word}' not found.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = {
        word: cleanWord,
        phonetic: phonetic,
        audio: audio,
        partOfSpeech: partOfSpeech,
        definition: definition,
        synonyms: synonyms,
      };

      response = new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400",
        },
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Internal server error occurred." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
