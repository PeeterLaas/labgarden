// Exercise the actual MCP transport. Run after the R dependencies are installed.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paivik-mcp-'));
  const child = spawn(process.env.RSCRIPT_BIN || 'Rscript', ['--vanilla', path.resolve('mcp.R')], {
    cwd: os.tmpdir(), env: { ...process.env, PAIVIK_WORKSPACE: path.join(dir, 'workspace.json') }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '', buffer = '';
  const pending = new Map();
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line) continue;
      try { const message = JSON.parse(line); pending.get(message.id)?.(message); pending.delete(message.id); }
      catch { child.kill(); throw new Error(`Non-JSON MCP output: ${line}`); }
    }
  });
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`MCP ${method} timeout: ${stderr}`)), 20000);
    pending.set(requestId, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');
  });
  try {
    const init = await call('initialize', {protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'paivik-test',version:'1'}});
    assert.ok(init.result, JSON.stringify(init));
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const listed = await call('tools/list');
    const names = listed.result.tools.map(t => t.name);
    assert.equal(names.length,6); assert.ok(!names.some(n => /commit|approve/.test(n)));
    const draft = await call('tools/call', {name:'draft_observation',arguments:{project_id:'p-local',text:'Synthetic MCP wire observation'}});
    assert.ok(!draft.error && !draft.result.isError, JSON.stringify(draft));
    const status = await call('tools/call', {name:'workspace_status',arguments:{}});
    assert.ok(!status.error && !status.result.isError);
    const db = JSON.parse(fs.readFileSync(path.join(dir,'workspace.json'),'utf8'));
    assert.equal(db.state.nodes.length,0); assert.equal(db.drafts.length,1);
    const forbidden = await call('tools/call',{name:'commit',arguments:{}});
    assert.ok(forbidden.error || forbidden.result?.isError);
    console.log('MCP stdio passed: handshake, six bounded tools, draft persistence, no model commit tool.');
  } finally {
    child.stdin.end();
    child.kill();
    await once(child,'close');
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
