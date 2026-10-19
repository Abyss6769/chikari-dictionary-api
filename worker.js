export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    const url = new URL(request.url);
    const word = url.searchParams.get("word")?.trim().toLowerCase();

    if (!word) {
      return new Response(JSON.stringify({ error: "No word provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    try {
      // 1. Try Free Dictionary API first (provides audio MP3 & phonetics)
      const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      
      if (dictRes.ok) {
        const dictData = await dictRes.json();
        const entry = dictData[0];

        // Find the first audio file that is non-empty
        let audioUrl = "";
        let phoneticText = entry.phonetic || "";

        if (entry.phonetics && entry.phonetics.length > 0) {
          const validAudio = entry.phonetics.find(p => p.audio && p.audio.trim() !== "");
          if (validAudio) {
            audioUrl = validAudio.audio;
          }
          if (!phoneticText) {
            const validPhonetic = entry.phonetics.find(p => p.text && p.text.trim() !== "");
            if (validPhonetic) {
              phoneticText = validPhonetic.text;
            }
          }
        }

        // Extract definition, part of speech, and synonyms
        let definition = "";
        let partOfSpeech = "";
        let synonyms = [];

        if (entry.meanings && entry.meanings.length > 0) {
          const firstMeaning = entry.meanings[0];
          partOfSpeech = firstMeaning.partOfSpeech || "";
          
          if (firstMeaning.definitions && firstMeaning.definitions.length > 0) {
            definition = firstMeaning.definitions[0].definition || "";
            synonyms = firstMeaning.definitions[0].synonyms?.slice(0, 5) || [];
          }

          if (synonyms.length === 0 && firstMeaning.synonyms) {
            synonyms = firstMeaning.synonyms.slice(0, 5);
          }
        }

        const payload = {
          word: entry.word || word,
          phonetic: phoneticText,
          audio: audioUrl,
          partOfSpeech: partOfSpeech,
          definition: definition,
          synonyms: synonyms
        };

        return new Response(JSON.stringify(payload), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      // 2. Fallback to Datamuse if not found in Free Dictionary API
      const datamuseRes = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=dp&max=1`);
      const datamuseData = await datamuseRes.json();

      if (datamuseData.length > 0 && datamuseData[0].defs) {
        const defRaw = datamuseData[0].defs[0] || "";
        const [pos, ...defParts] = defRaw.split("\t");

        return new Response(JSON.stringify({
          word: word,
          phonetic: "",
          audio: "",
          partOfSpeech: pos || "",
          definition: defParts.join(" "),
          synonyms: []
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      return new Response(JSON.stringify({ error: `Definition for '${word}' not found.` }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
