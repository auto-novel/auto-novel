export type Glossary = { [key: string]: string };

export namespace Glossary {
  export const toJson = (glossary: Glossary) => {
    return JSON.stringify(glossary, null, 2);
  };
  const fromJson = (text: string): Glossary | undefined => {
    try {
      const obj = JSON.parse(text);
      if (typeof obj !== 'object') return;
      const glossary: Glossary = {};
      for (const jp in obj) {
        const zh = obj[jp];
        if (typeof zh !== 'string') return;
        glossary[jp.trim()] = zh.trim();
      }
      return glossary;
    } catch {
      return;
    }
  };

  const delimiter = '=>';
  const toHumanReadableFormat = (glossary: Glossary) => {
    const lines = [];
    for (const jp in glossary) {
      const zh = glossary[jp];
      lines.push(`${jp} ${delimiter} ${zh}`);
    }
    return lines.join('\n');
  };
  const fromHumanReadableFormat = (text: string): Glossary | undefined => {
    const glossary: Glossary = {};
    for (let line of text.split('\n')) {
      line = line.trim();
      if (line === '') continue;

      const parts = line.split(delimiter);
      if (parts.length !== 2) return;

      const [jp, zh] = parts;
      const jpTrimmed = jp.trim();
      if (!jpTrimmed) continue;
      glossary[jpTrimmed] = zh.trim();
    }
    return glossary;
  };

  export const toText = (glossary: Glossary) => {
    return toHumanReadableFormat(glossary);
  };
  export const fromText = (text: string): Glossary | undefined => {
    return fromJson(text) ?? fromHumanReadableFormat(text);
  };
}
