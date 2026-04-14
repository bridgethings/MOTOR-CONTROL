const dataviewToString = (dataview: DataView, encoding: string = 'utf-8') => {
  const decoder = new TextDecoder(encoding);
  return decoder.decode(
    (dataview.buffer as ArrayBuffer).slice(
      dataview.byteOffset,
      dataview.byteOffset + dataview.byteLength
    )
  );
};

export default dataviewToString;
