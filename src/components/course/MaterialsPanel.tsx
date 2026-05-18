'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Material } from '@/lib/firestore/materials';

interface TopicNode {
  title: string;
  level: number;
  subtopics: TopicNode[];
}

interface Props {
  courseId: string;
  onOpenViewer: (mode: 'material-text', data: any, relatedDocs?: any[]) => void;
}

const FONT = "'Noto Serif', Georgia, serif";

// ── Recursive topic tree with per-node collapse ───────────────────────────────
function TopicTree({ nodes, depth = 0 }: { nodes: TopicNode[]; depth?: number }) {
  // Start all level-0 nodes expanded, deeper nodes collapsed
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(nodes.map((_, i) => i).filter(() => depth > 0))
  );

  const toggle = (i: number) =>
    setCollapsed(s => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  if (!nodes || nodes.length === 0) return null;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {nodes.map((node, i) => {
        const hasChildren = Array.isArray(node.subtopics) && node.subtopics.length > 0;
        const isCollapsed = collapsed.has(i);

        // Left-border accent by depth
        const borderStyle =
          depth === 0
            ? '2px solid rgba(196,160,80,0.55)'
            : depth === 1
            ? '1px solid rgba(196,160,80,0.25)'
            : '1px solid rgba(196,160,80,0.08)';
        const leftPad = depth === 0 ? '8px' : depth === 1 ? '6px' : '4px';
        const marginLeft = depth === 0 ? '0' : `${depth * 12}px`;

        return (
          <li key={i} style={{ marginLeft }}>
            <div
              onClick={() => hasChildren && toggle(i)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '5px',
                padding: '3px 0',
                cursor: hasChildren ? 'pointer' : 'default',
                borderLeft: borderStyle,
                paddingLeft: leftPad,
                marginBottom: '1px',
              }}
            >
              {/* Expand/collapse arrow */}
              {hasChildren ? (
                <span
                  style={{
                    fontSize: '0.5rem',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    marginTop: '4px',
                    display: 'inline-block',
                    transition: 'transform 0.15s',
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    userSelect: 'none',
                  }}
                >
                  ▾
                </span>
              ) : depth > 0 ? (
                <span
                  style={{
                    fontSize: '0.5rem',
                    color: 'rgba(196,160,80,0.35)',
                    flexShrink: 0,
                    marginTop: '4px',
                    userSelect: 'none',
                  }}
                >
                  –
                </span>
              ) : null}

              <span
                style={{
                  fontFamily: FONT,
                  fontSize:
                    depth === 0 ? '0.8rem' : depth === 1 ? '0.75rem' : '0.71rem',
                  fontWeight: depth === 0 ? 700 : depth === 1 ? 500 : 400,
                  color:
                    depth === 0
                      ? 'var(--text-primary)'
                      : depth === 1
                      ? 'var(--text-secondary)'
                      : 'var(--text-muted)',
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {node.title}
              </span>

              {/* Child count badge on collapsed nodes */}
              {hasChildren && isCollapsed && (
                <span
                  style={{
                    fontSize: '0.55rem',
                    color: 'var(--text-muted)',
                    background: 'rgba(196,160,80,0.08)',
                    borderRadius: '99px',
                    padding: '1px 5px',
                    flexShrink: 0,
                    marginTop: '3px',
                  }}
                >
                  {countAll(node.subtopics)}
                </span>
              )}
            </div>

            {hasChildren && !isCollapsed && (
              <TopicTree nodes={node.subtopics} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Count total descendant nodes (for collapsed badge) */
function countAll(nodes: TopicNode[]): number {
  let n = nodes.length;
  for (const node of nodes) {
    if (node.subtopics?.length) n += countAll(node.subtopics);
  }
  return n;
}

/** Count only top-level nodes + direct children for the summary badge */
function topicSummaryCount(tree: TopicNode[], contentList: string[]): string {
  if (tree.length > 0) {
    const total = countAll(tree) + tree.length;
    // e.g. "6 topics · 14 subtopics"
    const sub = total - tree.length;
    return sub > 0
      ? `${tree.length} topic${tree.length !== 1 ? 's' : ''} · ${sub} subtopic${sub !== 1 ? 's' : ''}`
      : `${tree.length} topic${tree.length !== 1 ? 's' : ''}`;
  }
  return `${contentList.length} topic${contentList.length !== 1 ? 's' : ''}`;
}

export default function MaterialsPanel({ courseId, onOpenViewer }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topicsOpen, setTopicsOpen] = useState<Set<string>>(new Set());
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);

    // Fetch both own + shared materials. We intentionally do NOT filter by
    // status here — the admin may have approved via Firestore directly with
    // a different field value. We show everything that's indexed.
    Promise.all([
      getDocs(
        query(
          collection(db, 'materials'),
          where('confirmedCourseId', '==', courseId),
          where('indexed', '==', true)
        )
      ),
      getDocs(
        query(
          collection(db, 'materials'),
          where('sharedCourseIds', 'array-contains', courseId),
          where('indexed', '==', true)
        )
      ),
    ])
      .then(([ownSnap, sharedSnap]) => {
        const seen = new Set<string>();
        const all: Material[] = [];
        [...ownSnap.docs, ...sharedSnap.docs].forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            all.push({ id: d.id, ...d.data() } as Material);
          }
        });
        // Sort: lecture_notes first, then others, then past_questions / aoc last
        all.sort((a: any, b: any) => {
          const order = (cat: string) =>
            cat === 'lecture_notes' ? 0 : cat === 'syllabus' ? 1 : cat === 'other' ? 2 : 3;
          return order(a.category ?? '') - order(b.category ?? '');
        });
        setMaterials(all);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [courseId]);

  const getGeneratedPdfUrl = async (m: Material): Promise<string | null> => {
    const data = m as any;
    const direct =
      data.generatedPdfUrl ||
      data.generatedFileUrl ||
      data.pdfUrl ||
      data.generatedPdf ||
      null;
    if (direct) return direct;
    if (data.generatedPublicId) {
      if (fileUrls[m.id + '_gen']) return fileUrls[m.id + '_gen'];
      setFetchingUrl(m.id + '_gen');
      try {
        const params = new URLSearchParams({
          publicId: data.generatedPublicId,
          fileUrl: '',
        });
        const res = await fetch('/api/material-url?' + params);
        const json = await res.json();
        if (json.url) {
          setFileUrls(prev => ({ ...prev, [m.id + '_gen']: json.url }));
          return json.url;
        }
      } catch {
        // ignore
      } finally {
        setFetchingUrl(null);
      }
    }
    return null;
  };

  const toggleTopics = (id: string) =>
    setTopicsOpen(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (loading)
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <MiniLoader label="Loading materials..." />
      </div>
    );

  if (materials.length === 0)
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>📂</p>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            fontFamily: 'Lora, serif',
          }}
        >
          No indexed materials yet for this course.
        </p>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {materials.map(m => {
        const data = m as any;
        const icon =
          m.category === 'past_questions'
            ? '📋'
            : m.category === 'textbook'
            ? '📖'
            : '📄';
        const pageInfo = m.pageCount ? ' · ' + m.pageCount + ' pages' : '';
        const wordInfo =
          (m.wordCount ? m.wordCount.toLocaleString() : '0') +
          ' words' +
          pageInfo;
        const isOpen = expanded === m.id;
        const hasGeneratedPdf = !!(
          data.generatedPdfUrl ||
          data.generatedFileUrl ||
          data.pdfUrl ||
          data.generatedPdf ||
          data.generatedPublicId
        );
        const topicTree: TopicNode[] = Array.isArray(data.topicTree)
          ? data.topicTree.filter(
              (t: any) =>
                t && typeof t.title === 'string' && t.title.trim().length > 0
            )
          : [];
        const contentList: string[] = Array.isArray(data.contentList)
          ? data.contentList.filter(
              (t: any) => typeof t === 'string' && t.trim().length > 1
            )
          : [];
        const hasTopics = topicTree.length > 0 || contentList.length > 0;
        const isTopicsOpen = topicsOpen.has(m.id);
        const displayName = data.indexDisplayName || m.fileName;
        const isShared =
          data.sharedCourseIds?.includes(courseId) &&
          data.confirmedCourseId !== courseId;

        return (
          <div
            key={m.id}
            style={{
              background: 'var(--navy)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {/* ── Header row ── */}
            <div
              onClick={() => setExpanded(isOpen ? null : m.id)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: FONT,
                  }}
                >
                  {displayName}
                </p>
                <p
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                  }}
                >
                  {wordInfo}
                  {isShared && (
                    <span
                      style={{
                        marginLeft: '6px',
                        color: 'rgba(196,160,80,0.6)',
                        fontSize: '0.62rem',
                      }}
                    >
                      · shared
                    </span>
                  )}
                </p>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {isOpen ? '▲' : '▼'}
              </span>
            </div>

            {/* ── Expanded panel ── */}
            {isOpen && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* AI summary */}
                {data.aiSummary && (
                  <p
                    style={{
                      fontFamily: FONT,
                      fontSize: '0.73rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.6,
                      fontStyle: 'italic',
                      padding: '6px 8px',
                      background: 'rgba(196,160,80,0.04)',
                      borderLeft: '2px solid rgba(196,160,80,0.3)',
                      borderRadius: '0 6px 6px 0',
                    }}
                  >
                    {data.aiSummary}
                  </p>
                )}

                {/* ── Topic tree ── */}
                {hasTopics && (
                  <div>
                    <button
                      onClick={() => toggleTopics(m.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.73rem',
                        color: 'var(--text-secondary)',
                        padding: '4px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.6rem',
                          display: 'inline-block',
                          transition: 'transform 0.15s',
                          transform: isTopicsOpen
                            ? 'rotate(0deg)'
                            : 'rotate(-90deg)',
                        }}
                      >
                        ▾
                      </span>
                      📚 {topicSummaryCount(topicTree, contentList)}
                    </button>

                    {isTopicsOpen && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '10px',
                          background: 'rgba(196,160,80,0.03)',
                          borderRadius: '8px',
                          border: '1px solid rgba(196,160,80,0.1)',
                        }}
                      >
                        {topicTree.length > 0 ? (
                          <TopicTree nodes={topicTree} depth={0} />
                        ) : (
                          // Flat contentList fallback — shown only when no tree
                          contentList.map((t, i) => (
                            <div
                              key={i}
                              style={{
                                fontFamily: FONT,
                                fontSize: '0.74rem',
                                color: 'var(--text-secondary)',
                                borderLeft: '2px solid rgba(196,160,80,0.3)',
                                lineHeight: 1.5,
                                marginBottom: '3px',
                                padding: '2px 0 2px 10px',
                              }}
                            >
                              {t}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* View full text */}
                {m.extractedText ? (
                  <button
                    onClick={() =>
                      onOpenViewer('material-text', {
                        fileName: displayName,
                        extractedText: m.extractedText,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>📝 View full text</span>
                    <span style={{ fontSize: '0.65rem' }}>↗</span>
                  </button>
                ) : (
                  <p
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      padding: '4px',
                    }}
                  >
                    No extracted text available.
                  </p>
                )}

                {/* Generated PDF */}
                {hasGeneratedPdf && (
                  <button
                    onClick={async () => {
                      const url = await getGeneratedPdfUrl(m);
                      if (url) window.open(url, '_blank');
                    }}
                    disabled={fetchingUrl === m.id + '_gen'}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: '1px solid rgba(196,160,80,0.35)',
                      background: 'rgba(196,160,80,0.07)',
                      color: 'var(--gold)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>📄</span>
                    <span>
                      {fetchingUrl === m.id + '_gen'
                        ? 'Loading...'
                        : 'Open generated PDF'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
