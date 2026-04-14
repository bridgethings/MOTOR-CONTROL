const sliceStringIntoChunks = (str: string, chunkSize: number = 20): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }
  return chunks;
};

export default sliceStringIntoChunks;
