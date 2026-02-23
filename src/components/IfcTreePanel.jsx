import { useState, useEffect, useCallback, useMemo } from 'react';
import { SPATIAL_TYPES, getTypeIcon, getTypeLabel } from '../utils/ifcTypes';
import { Eye, EyeOff, ChevronRight, ChevronDown, RefreshCw, X, Search } from 'lucide-react';

/* ─── Utility ─── */

/** Collect all expressIDs in a subtree (inclusive) */
function collectAllIDs(node) {
  const ids = [node.expressID];
  for (const child of node.children ?? []) {
    ids.push(...collectAllIDs(child));
  }
  return ids;
}

/** Check if a node or any of its descendants match the search query */
function nodeMatchesSearch(node, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const nameMatch = node.name?.toLowerCase().includes(q);
  const typeMatch = node.type?.toLowerCase().includes(q);
  if (nameMatch || typeMatch) return true;
  return (node.children ?? []).some(c => nodeMatchesSearch(c, query));
}

/* ─── TreeNode ─── */

function TreeNode({ node, viewerRef, hiddenIDs, onToggleHidden, modelId, depth = 0 }) {
  const isSpatial = SPATIAL_TYPES.has(node.type);
  const [expanded, setExpanded] = useState(isSpatial);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isHidden = hiddenIDs.has(node.expressID);

  const handleSelect = useCallback((e) => {
    e.stopPropagation();
    viewerRef.current?.highlightNode(node.expressID, modelId);
  }, [node.expressID, modelId, viewerRef]);

  const handleToggleVisible = useCallback((e) => {
    e.stopPropagation();
    const allIDs = collectAllIDs(node);
    onToggleHidden(allIDs, !isHidden, modelId);
  }, [node, isHidden, modelId, onToggleHidden]);

  const handleExpand = useCallback((e) => {
    e.stopPropagation();
    setExpanded(v => !v);
  }, []);

  return (
    <div className="tree-node" style={{ '--depth': depth }}>
      <div
        className={`tree-row ${isSpatial ? 'tree-row-spatial' : ''}`}
        onClick={handleSelect}
        title={`${node.type} — #${node.expressID}`}
      >
        {/* Indent + expand button */}
        <div className="tree-indent" style={{ width: depth * 14 + 4 }} />

        <button
          className={`tree-expand-btn ${hasChildren ? '' : 'tree-expand-btn--leaf'}`}
          onClick={hasChildren ? handleExpand : undefined}
          tabIndex={-1}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
            : <span className="tree-dot" />
          }
        </button>

        {/* Type icon */}
        <span className="tree-icon">{getTypeIcon(node.type)}</span>

        {/* Name + type badge */}
        <span className="tree-label">
          <span className="tree-name">{node.name}</span>
          {!isSpatial && (
            <span className="tree-badge">{getTypeLabel(node.type)}</span>
          )}
        </span>

        {/* Visibility toggle */}
        <button
          className={`tree-vis-btn ${isHidden ? 'tree-vis-btn--hidden' : ''}`}
          onClick={handleToggleVisible}
          title={isHidden ? 'Show' : 'Hide'}
          tabIndex={-1}
        >
          {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map(child => (
            <TreeNode
              key={child.expressID}
              node={child}
              viewerRef={viewerRef}
              hiddenIDs={hiddenIDs}
              onToggleHidden={onToggleHidden}
              modelId={modelId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Filtered rendering ─── */

function FilteredTree({ node, viewerRef, hiddenIDs, onToggleHidden, query, modelId, depth = 0 }) {
  if (!nodeMatchesSearch(node, query)) return null;
  const filteredChildren = (node.children ?? []).filter(c => nodeMatchesSearch(c, query));
  const patchedNode = { ...node, children: filteredChildren };

  return (
    <TreeNode
      node={patchedNode}
      viewerRef={viewerRef}
      hiddenIDs={hiddenIDs}
      onToggleHidden={onToggleHidden}
      modelId={modelId}
      depth={depth}
    />
  );
}

/* ─── Panel ─── */

export default function IfcTreePanel({ viewerRef, refreshKey, onClose }) {
  const [models, setModels] = useState([]);   // [{ modelId, name, tree }]
  const [loading, setLoading] = useState(false);
  const [hiddenIDs, setHiddenIDs] = useState(new Set());
  const [search, setSearch] = useState('');

  /* Refresh tree whenever refreshKey changes (new model loaded) */
  const refresh = useCallback(async () => {
    if (!viewerRef.current) return;
    setLoading(true);
    try {
      const data = await viewerRef.current.getSpatialStructure();
      setModels(data ?? []);
      setHiddenIDs(new Set()); // reset visibility state on full refresh
    } catch (err) {
      console.warn('[TREE] Failed to refresh tree:', err);
    } finally {
      setLoading(false);
    }
  }, [viewerRef]);

  useEffect(() => {
    if (refreshKey > 0) refresh();
  }, [refreshKey, refresh]);

  /* Toggle visibility for a set of expressIDs */
  const handleToggleHidden = useCallback((ids, hide, modelId) => {
    setHiddenIDs(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (hide) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    // Apply to viewer
    viewerRef.current?.setNodeVisibility(ids, !hide, modelId);
  }, [viewerRef]);

  /* Show all */
  const handleShowAll = useCallback(() => {
    setHiddenIDs(new Set());
    viewerRef.current?.showAll();
  }, [viewerRef]);

  const totalElements = useMemo(() => {
    let count = 0;
    const countNodes = (node) => {
      count++;
      (node.children ?? []).forEach(countNodes);
    };
    models.forEach(m => m.tree && countNodes(m.tree));
    return count;
  }, [models]);

  return (
    <div className="tree-panel">
      {/* Header */}
      <div className="panel-header">
        <h3>
          <span>🌳</span>
          <span>IFC Structure</span>
          {totalElements > 0 && (
            <span className="tree-count-badge">{totalElements}</span>
          )}
        </h3>
        <div className="tree-header-actions">
          {hiddenIDs.size > 0 && (
            <button className="tree-action-btn" onClick={handleShowAll} title="Show All">
              <Eye size={14} />
            </button>
          )}
          <button
            className={`tree-action-btn ${loading ? 'spinning' : ''}`}
            onClick={refresh}
            title="Refresh tree"
            disabled={loading}
          >
            <RefreshCw size={14} />
          </button>
          <button className="tree-action-btn" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="tree-search">
        <Search size={13} className="tree-search-icon" />
        <input
          className="tree-search-input"
          type="text"
          placeholder="Search elements…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="tree-search-clear" onClick={() => setSearch('')}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="tree-content">
        {loading ? (
          <div className="tree-empty">
            <div className="spinner-small" />
            <span>Building structure…</span>
          </div>
        ) : models.length === 0 ? (
          <div className="tree-empty">
            <p>No models loaded.</p>
            <p className="tree-empty-sub">Load an IFC file to see its structure.</p>
          </div>
        ) : (
          models.map(({ modelId, name, tree }) => (
            <div key={modelId} className="tree-model-block">
              <div className="tree-model-header">
                <span>📁</span>
                <span className="tree-model-name" title={name}>{name}</span>
              </div>
              {tree ? (
                search ? (
                  <FilteredTree
                    node={tree}
                    viewerRef={viewerRef}
                    hiddenIDs={hiddenIDs}
                    onToggleHidden={handleToggleHidden}
                    query={search}
                    modelId={modelId}
                  />
                ) : (
                  <TreeNode
                    node={tree}
                    viewerRef={viewerRef}
                    hiddenIDs={hiddenIDs}
                    onToggleHidden={handleToggleHidden}
                    modelId={modelId}
                  />
                )
              ) : (
                <div className="tree-empty tree-empty-sm">No structure available</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
