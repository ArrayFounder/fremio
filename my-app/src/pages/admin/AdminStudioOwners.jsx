import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, RefreshCw, ArrowLeft, ExternalLink } from "lucide-react";
import api from "../../services/api";

export default function AdminStudioOwners() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [tierFilter, setTierFilter] = useState("all"); // "all" | "free" | "paid"
  const [upgrading, setUpgrading] = useState(null); // id being upgraded
  const [upgradeTier, setUpgradeTier] = useState("PRO");
  const [upgradeMonths, setUpgradeMonths] = useState(1);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const json = await api.get("/admin/studio/operators");
      if (!json.success) throw new Error(json.message ?? "Gagal memuat data");
      setOwners(json.data ?? []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upgradeAccount = async (id) => {
    setUpgradeLoading(true);
    try {
      const json = await api.put(`/admin/studio/operators/${id}`, { tier: upgradeTier, months: upgradeMonths });
      if (!json.success) throw new Error(json.message ?? "Gagal upgrade");
      await load();
      setUpgrading(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setUpgradeLoading(false);
    }
  };

  const filtered = owners.filter(o => {
    const matchSearch = search === "" || o.email?.toLowerCase().includes(search.toLowerCase()) || o.businessName?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    const tier = String(o.subscriptionTier || "").toUpperCase();
    if (tierFilter === "free") return tier === "STARTER" || tier === "FREE";
    if (tierFilter === "paid") return tier === "PRO" || tier === "ENTERPRISE";
    return true;
  });
  const spin = { display:"inline-block", width:32, height:32, border:"3px solid #f3ebe8", borderTop:"3px solid #e0b7a9", borderRadius:"50%", animation:"spin 1s linear infinite" };

  return (
    <div style={{ background:"linear-gradient(180deg,#fdf7f4 0%,#fff 50%,#f7f1ed 100%)", minHeight:"100vh", padding:"32px 0 48px" }}>
      <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <button onClick={()=>navigate("/admin/dashboard")} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#fff", border:"1px solid #e0b7a9", borderRadius:8, fontSize:13, fontWeight:600, color:"#555", cursor:"pointer" }}>
            <ArrowLeft size={14}/> Dashboard
          </button>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#333" }}>Studio Owners</h1>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Users size={18} color="#888" />
            <span style={{ fontSize:14, color:"#555", fontWeight:600 }}>{owners.length} akun · {owners.reduce((s,o)=>s+(o.boothConfigs?.length??0),0)} booth</span>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {["all","free","paid"].map((k)=>{
              const active = tierFilter === k;
              const label = k==="all"?"All":k==="free"?"Free (Starter)":"Paid (Pro/Enterprise)";
              const count = k==="all"?owners.length:owners.filter(o=>{
                const t=String(o.subscriptionTier||"").toUpperCase();
                return k==="free"?(t==="STARTER"||t==="FREE"):(t==="PRO"||t==="ENTERPRISE");
              }).length;
              return (
                <button key={k} onClick={()=>setTierFilter(k)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", background:active?"#111827":"#fff", border:"1px solid #e0b7a9", borderRadius:8, fontSize:12, fontWeight:600, color:active?"#fff":"#555", cursor:"pointer" }}>
                  {label}
                  <span style={{ background:active?"#374151":"#f3f4f6", color:active?"#d1d5db":"#6b7280", borderRadius:6, padding:"1px 5px", fontSize:10, fontWeight:700 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ position:"relative" }}>
              <Search size={14} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#aaa" }} />
              <input type="text" placeholder="Cari nama / email..." value={search} onChange={e=>setSearch(e.target.value)}
                style={{ padding:"8px 12px 8px 32px", border:"1px solid #e0b7a9", borderRadius:8, fontSize:13, outline:"none", width:220 }} />
            </div>
            <button onClick={load} disabled={loading} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:loading?"#f0f0f0":"#fff", border:"1px solid #e0b7a9", borderRadius:8, fontSize:13, fontWeight:600, color:"#555", cursor:loading?"not-allowed":"pointer" }}>
              <RefreshCw size={13} style={{ animation: loading?"spin 1s linear infinite":"none" }} /> Refresh
            </button>
          </div>
        </div>

        {error && <div style={{ padding:16, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, color:"#ef4444", fontSize:14, marginBottom:16 }}>⚠️ {error}</div>}

        <div style={{ background:"#fff", border:"1px solid #ecdeda", borderRadius:14, overflow:"hidden" }}>
          {loading ? <div style={{ padding:40, textAlign:"center" }}><div style={spin}/></div> :
           !filtered.length ? <div style={{ padding:32, textAlign:"center", color:"#aaa", fontSize:14 }}>Tidak ada owner yang cocok.</div> :
           <div style={{ overflowX:"auto" }}>
             <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
               <thead>
                 <tr style={{ background:"#fdf7f4", borderBottom:"1px solid #f3ebe8" }}>
                   {["#","Nama Bisnis","Email","Tier","Booth","Terdaftar",""].map(h=><th key={h} style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, color:"#555", whiteSpace:"nowrap" }}>{h}</th>)}
                 </tr>
               </thead>
               <tbody>
                 {filtered.map((o,idx)=>{
                   const isExp = expanded === o.id;
                   const tc = o.subscriptionTier==="ENTERPRISE"?"#7c3aed":o.subscriptionTier==="PRO"?"#2563eb":"#6b7280";
                   const active = o.subscriptionExpiry && new Date(o.subscriptionExpiry)>new Date();
                   return (
                     <>
                       <tr key={o.id} style={{ borderBottom:"1px solid #f3ebe8", background:isExp?"#fffaf9":"white", cursor:"pointer" }} onClick={()=>setExpanded(isExp?null:o.id)}>
                         <td style={{ padding:"12px 16px", color:"#aaa", width:40 }}>{idx+1}</td>
                         <td style={{ padding:"12px 16px", fontWeight:600, color:"#222" }}>{o.businessName||<span style={{color:"#aaa"}}>—</span>}</td>
                         <td style={{ padding:"12px 16px", color:"#555" }}>{o.email}</td>
                         <td style={{ padding:"12px 16px" }}>
                           <span style={{ background:tc+"18", color:tc, borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:11 }}>{o.subscriptionTier}</span>
                           {!active && <span style={{ marginLeft:4, fontSize:10, color:"#ef4444", fontWeight:600 }}>EXPIRED</span>}
                         </td>
                         <td style={{ padding:"12px 16px" }}>
                           <span style={{ background:o.boothConfigs?.length?"#dcfce7":"#f3f4f6", color:o.boothConfigs?.length?"#16a34a":"#9ca3af", borderRadius:6, padding:"2px 8px", fontWeight:700, fontSize:12 }}>{o.boothConfigs?.length??0} booth</span>
                         </td>
                         <td style={{ padding:"12px 16px", color:"#888", whiteSpace:"nowrap" }}>{new Date(o.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}</td>
                         <td style={{ padding:"12px 16px", textAlign:"right", color:"#e0b7a9", fontWeight:700, fontSize:18 }}>{isExp?"▲":"▼"}</td>
                       </tr>
                       {isExp && (
                         <tr key={o.id+"_b"} style={{ background:"#fffaf9" }}>
                           <td colSpan={7} style={{ padding:"0 16px 16px 56px" }}>
                             {o.boothConfigs?.length ? (
                               <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:8 }}>
                                 {o.boothConfigs.map(b=> (
                                   <a key={b.id} href={`https://studio.fremio.id/b/${b.slug}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                                     style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", background:"white", border:"1px solid #e0b7a9", borderRadius:8, fontSize:12, color:"#333", textDecoration:"none", fontWeight:600 }}>
                                     🎪 {b.boothName} <span style={{ color:"#e0b7a9", fontSize:11 }}>/{b.slug}</span> <ExternalLink size={12} style={{color:"#e0b7a9"}}/>
                                   </a>
                                 ))}
                               </div>
                             ) : <p style={{ margin:"8px 0 0", color:"#aaa", fontSize:12 }}>Belum ada booth.</p>}

                             {/* Upgrade form for free/trial accounts */}
                             {(o.subscriptionTier === "STARTER" || o.subscriptionTier === "FREE") && (
                               <div style={{ marginTop:12, padding:12, background:"white", border:"1px solid #e0b7a9", borderRadius:8 }}>
                                 <div style={{ fontSize:12, fontWeight:700, color:"#333", marginBottom:8 }}>Upgrade ke Paid</div>
                                 <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                                   <select value={upgradeTier} onChange={e=>setUpgradeTier(e.target.value)} onClick={e=>e.stopPropagation()}
                                     style={{ padding:"6px 10px", border:"1px solid #e0b7a9", borderRadius:6, fontSize:12 }}>
                                     <option value="PRO">PRO</option>
                                   </select>
                                   <select value={upgradeMonths} onChange={e=>setUpgradeMonths(Number(e.target.value))} onClick={e=>e.stopPropagation()}
                                     style={{ padding:"6px 10px", border:"1px solid #e0b7a9", borderRadius:6, fontSize:12 }}>
                                     <option value={1}>1 hari</option>
                                     <option value={3}>3 hari</option>
                                     <option value={7}>7 hari</option>
                                     <option value={14}>14 hari</option>
                                     <option value={30}>30 hari</option>
                                     <option value={60}>60 hari</option>
                                     <option value={90}>90 hari</option>
                                   </select>
                                   <button onClick={e=>{e.stopPropagation(); upgradeAccount(o.id);}} disabled={upgradeLoading}
                                     style={{ padding:"6px 14px", background:upgradeLoading?"#f0f0f0":"#111827", color:upgradeLoading?"#999":"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:upgradeLoading?"not-allowed":"pointer" }}>
                                     {upgradeLoading ? "Menyimpan..." : "Konfirmasi Upgrade"}
                                   </button>
                                 </div>
                               </div>
                             )}
                           </td>
                         </tr>
                       )}
                     </>
                   );
                 })}
               </tbody>
             </table>
           </div>}
        </div>
      </div>
    </div>
  );
}
