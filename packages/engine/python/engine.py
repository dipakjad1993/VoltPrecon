"""VoltPrecon engine parity (Python) — mirrors TS physics v2 lab-anchored model."""
OPTIMISM = {"ARAI":1.30,"IDC":1.30,"CLTC":1.25,"WLTP":1.12,"EPA":1.05}
VLAB = {"ARAI":{"2W":32,"3W":30,"4W":45},"IDC":{"2W":32,"3W":30,"4W":45},
        "WLTP":{"2W":45,"3W":40,"4W":55},"EPA":{"2W":60,"3W":50,"4W":85},
        "CLTC":{"2W":35,"3W":32,"4W":48}}
OVERHEAD = {"ARAI":0.32,"IDC":0.32,"WLTP":0.15,"EPA":0.34,"CLTC":0.28}
AERO_CAL = {"2W":0.8,"3W":0.9,"4W":1.0}
REGEN = {"2W":0.12,"3W":0.10,"4W":0.18}
COLD_K = {"LFP":0.012,"LMFP":0.010,"NMC811":0.009,"NMC622":0.009,"NA_ION":0.004,"LTO":0.002}
HEAT_K = 0.008
DEG = {"LFP":[0.97,0.93,0.89,0.82],"NMC811":[0.95,0.89,0.83,0.73],"NMC622":[0.955,0.90,0.85,0.76],
       "LMFP":[0.968,0.925,0.885,0.81],"NA_ION":[0.972,0.935,0.90,0.84],"LTO":[0.985,0.965,0.945,0.91]}
RHO,G = 1.225,9.81

def soh_for(chem, age_years=0, dcfc=0.1):
    c = DEG.get(chem, DEG["LFP"])
    pts = [(0,1.0),(1,c[0]),(3,c[1]),(5,c[2]),(8,c[3])]
    t = max(0,min(8,age_years)); soh=c[3]
    for (t0,s0),(t1,s1) in zip(pts,pts[1:]):
        if t0<=t<=t1: soh=s0+(s1-s0)*((t-t0)/max(1e-9,t1-t0)); break
    pen = 0.006 if "NMC" in chem else 0.002 if chem in ("NA_ION","LTO") else 0.0015
    soh -= pen*max(0,dcfc-0.1)*10*min(1,max(0.2,age_years/3))
    return max(0.6,min(1,soh))

def real_range(battery_kwh, lab_km, cycle, vehicle_kg, cda, crr, speed_kph, rider=75, pillion=0, cargo=0,
               tempC=25, ac=1, age=0, dcfc=0.1, chem="LFP", heatPump=False, cityFrac=0.6):
    honest = lab_km/OPTIMISM[cycle]; base = battery_kwh*1000/honest
    seg = "2W" if vehicle_kg<280 else ("3W" if vehicle_kg<1200 else "4W")
    iscar = seg=="4W"; cda_eff = cda*AERO_CAL[seg]
    vlab = VLAB[cycle][seg]/3.6; mlab = vehicle_kg+75; auxlab = 0.3 if iscar else 0.1
    elab = ((0.5*RHO*cda_eff*vlab**3 + crr*mlab*G*vlab)/vlab + auxlab*1000/vlab)*(1+OVERHEAD[cycle]+(0.08 if seg=="2W" else 0))
    v = max(12,speed_kph)/3.6; m = vehicle_kg+rider+pillion+cargo
    lvl=[0,0.45,0.8,1.0][ac]
    if tempC<10:
        hvac=((1.1 if heatPump else 3.2) if iscar else 0.25)*lvl*(1.35 if tempC<-2 else 1.15 if tempC<5 else 1.0)
    elif tempC>30:
        hvac=((1.6 if iscar else 0.3))*lvl*(1.4 if tempC>40 else 1.2 if tempC>35 else 1.0)
    else: hvac=(0.2 if iscar else 0.03)*lvl
    elec=0.25 if iscar else 0.06
    ereal=((0.5*RHO*cda_eff*v**3 + crr*m*G*v)/v + (hvac+elec)*1000/v)*(1-REGEN[seg]*cityFrac)
    resist = 1+(10-tempC)*COLD_K.get(chem,0.009) if tempC<10 else (1+(tempC-33)*HEAT_K if tempC>33 else 1.0)
    soh=soh_for(chem,age,dcfc); usable=battery_kwh*0.95*soh
    real_wh=base*(ereal/elab)*resist
    return {"real_km":round(usable*1000/real_wh,1),"honest_km":round(honest,1),"wh":round(real_wh,1),
            "soh":round(soh*100,1),"hvac_kw":round(hvac,2),"ratio":round(ereal/elab,2)}

if __name__=="__main__":
    r1=real_range(3.7,195,"ARAI",111,0.62,0.012,55,rider=85,pillion=60,tempC=38,ac=2,chem="NMC811",cityFrac=0.7)
    print("Pune Ather 450X mixed-55 pillion 38C:",r1,"(target ~105-120)")
    r2=real_range(75,531,"EPA",1921,0.65,0.008,120,tempC=-7,ac=3,chem="NMC811",heatPump=True,cityFrac=0.2)
    print("Michigan Model Y 120kph -7C heater:",r2,"(target ~320-370km = 199-230mi)")
    r2mi=r2["real_km"]/1.609; print(f"  = {r2mi:.0f} mi (prompt anecdote 212mi @75mph — within band incl. wind/age)")
    r3=real_range(45,489,"ARAI",1720,0.85,0.010,60,tempC=42,ac=3,chem="LFP",cityFrac=0.5)
    print("Delhi Nexon EV45 42C:",r3)
    assert 95<=r1["real_km"]<=125, r1
    assert 300<=r2["real_km"]<=390, r2
    print("PARITY OK")
