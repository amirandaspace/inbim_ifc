const LoadingOverlay = ({ loading, fileName }) => {
  if (!loading) return null;

  return (
    <div className="loading-overlay">
      <div className="spinner" />
      <div className="loading-text">Processing...</div>
      <div className="loading-sub">{fileName}</div>
    </div>
  );
};

export default LoadingOverlay;