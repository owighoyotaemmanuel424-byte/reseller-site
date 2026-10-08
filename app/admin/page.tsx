 },[router]);
 const load=useCallback(async (s:Section=section)=>{
   setLoading(true);setMessage("");
   try{
    const urls:any={overview:"/api/admin/stats",analytics:"/api/admin/orders",orders:"/api/admin/orders",users:"/api/admin/users",wallets:"/api/admin/wallets",catalog:"/api/admin/catalog",payments:"/api/admin/payments",provider:"/api/admin/catalog",audit:"/api/admin/audit",settings:"/api/admin/settings",security:"/api/admin/security",system:"/api/admin/health",security:"/api/admin/security",access:"/api/admin/permissions",reconciliation:"/api/admin/reconciliation"};
    setData(await request(urls[s]));
   }catch(e){setMessage(e instanceof Error?e.message:"Unable to load admin data")}
   finally{setLoading(false)}
 },[request,section]);
 // Data loading is an external-system synchronization; the callback intentionally updates loading/data state.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load(section)},[section,load]);

 async function action(fn:()=>Promise<any>,success:string){
   setBusy(true);setMessage("");
   try{await fn();setMessage(success);await load(section)}catch(e){setMessage(e instanceof Error?e.message:"Action failed")}finally{setBusy(false)}
 }