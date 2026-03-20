// src/TestAuth.jsx
import { useState } from "react";
import * as api from "./services/api.js";

export default function TestAuth() {
  const [log, setLog] = useState("");

  async function doRegister() {
    try {
      const res = await api.register("demo_user1", "secret");
      setLog("REGISTER OK: " + JSON.stringify(res, null, 2));
    } catch (err) {
      setLog("REGISTER FAIL: " + err.message);
    }
  }

  async function doLogin() {
    try {
      const res = await api.login("demo_user1", "secret");
      setLog("LOGIN OK: " + JSON.stringify(res, null, 2));
    } catch (err) {
      setLog("LOGIN FAIL: " + err.message);
    }
  }

  async function doCreateRoom() {
    try {
      const res = await api.createRoom("My First Room");
      setLog("ROOM CREATED: " + JSON.stringify(res, null, 2));
    } catch (err) {
      setLog("CREATE ROOM FAIL: " + err.message);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Test Auth Page</h1>
      <button onClick={doRegister}>Register</button>
      <button onClick={doLogin}>Login</button>
      <button onClick={doCreateRoom}>Create Room</button>
      <pre>{log}</pre>
    </div>
  );
}
