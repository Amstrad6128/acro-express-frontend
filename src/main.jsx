import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// Error boundary catches React rendering crashes that don't show in console
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  componentDidCatch(error, info) {
    console.error("React crash:", error, info);
    this.setState({ error: error.message });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", color: "white", background: "#0a0a0a", minHeight: "100vh" }}>
          <h1 style={{ color: "#f87171" }}>Something crashed</h1>
          <pre style={{ marginTop: "1rem", color: "#aaa", fontSize: "0.85rem" }}>
            {this.state.error}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);