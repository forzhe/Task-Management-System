// §6.7.5 语义记忆 v2：向量召回的本地确定性嵌入器。
// 设计：把文本哈希成固定维度向量（字符 trigram + 词 token），L2 归一化，
// 用余弦相似度做向量检索。完全离线、确定性、可测；是真 embedding API 的可替换接缝
// —— 未来把 embedText 换成 DeepSeek/OpenAI embeddings 即升级为语义级召回。

export const EMBED_DIM = 96;

/** FNV-1a 32 位哈希 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 文本 → 归一化向量。空文本返回零向量。 */
export function embedText(text: string, dim = EMBED_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!clean) return vec;

  const features: string[] = [];
  // 词 token
  for (const tok of clean.split(/[\s,，。！？、；：:/\\"'(){}\[\]]+/)) {
    if (tok.length >= 2) features.push(`w:${tok}`);
  }
  // 字符 trigram（对中文尤其有效，捕捉字共现）
  const compact = clean.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 2; i += 1) {
    features.push(`t:${compact.slice(i, i + 3)}`);
  }

  for (const f of features) {
    const idx = hash(f) % dim;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }

  // L2 归一化
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < dim; i += 1) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}

/** 余弦相似度（输入向量应已归一化，等价于点积）*/
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
