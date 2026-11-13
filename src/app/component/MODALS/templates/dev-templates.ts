/**
 * Drawings that exist to exercise the app rather than to teach a linkage.
 *
 * Their own file, because template-linkages.ts is generated from the
 * verification fixtures and checked against that generator -- these are
 * neither generated nor fixtures, and they are only ever offered in a
 * development build.
 */
export const DEV_TEMPLATE_IDS = ['Dev_All_Mechanism_Types', 'Dev_Object_Gallery'] as const;

export type DevTemplateID = (typeof DEV_TEMPLATE_IDS)[number];

export const DEV_TEMPLATES: Record<DevTemplateID, string> = {
  // One of each kind of machine in one drawing: a crank that goes round, a
  // ram that goes out and back, a slider, and a chain that never reaches
  // ground -- so every readiness state and every playback row is on screen at
  // once.
  //
  // Two joints in here are named with a backslash and a backtick, which the
  // encoder is entitled to use and a TypeScript string literal is entitled to
  // read as an escape. The backslashes are doubled for that reason; eating one
  // costs the checksum and the whole drawing refuses to load.
  Dev_All_Mechanism_Types:
    '2u.Ay,Fe.5,0.1011.4O,O,0,0,0.0C,C,YJ,qG,0.4G,G,ku,0,0.0N,N,aM,hl,0.8P,P,ir,8X,0.ZS,S,ir,8X,0,GN,G,N.0T,T,nJ,oD,0.0U,U,1Nd,dn,0.6V,V,1ca,jH,0,,,,1E8.6W,W,J-,1GP,0.0X,X,PF,1dt,0.0Y,Y,rW,1g7,0.4Z,Z,-P,1FX,0.0[,[,1Tk,16n,0.0\\,\\,1ft,1bA,0.0^,^,1pZ,1Gc,0.0_,_,1_5,_W,0.0`,`,2AU,1OV,0.1a,a,2AU,1OV,0..YROC,OC,Fe,Fe,HA,Q8,c5cae9,O,C,,.YRGN,GN,Fe,Fe,fd,Lu,303e9f,G,N,,.YRPC,PC,Fe,Fe,da,UO,0d125a,P,C,,.YPPS,PS,Fe,0,0,0,,P,S,,.YRGT,GT,Fe,Fe,m5,P7,c5cae9,G,T,,.YRTU,TU,Fe,Fe,14T,i-,303e9f,T,U,,.YRUV,UV,Fe,Fe,1V5,gX,0d125a,U,V,,.YRWX,WX,Fe,Fe,Md,1S8,B2DFDB,W,X,,.YRXY,XY,Fe,Fe,dN,1f0,26A69A,X,Y,,.YRYZ,YZ,Fe,Fe,wS,1Sr,00695C,Y,Z,,.YR[\\,[\\,Fe,Fe,1Zp,1Lz,c5cae9,[,\\,,.YR_`,_`,Fe,Fe,24I,1BV,B2DFDB,_,`,,.YP`a,`a,Fe,0,0,0,,`,a,,...N_a',
  // One of everything the canvas can draw, laid out in rows and deliberately
  // not simulatable: forty-nine joints and twenty-six links covering every
  // kind of pin, block, weld, slot and cylinder, with forces on the last of
  // them.
  Dev_Object_Gallery:
    '2v.VC,1E8.5,0.1011.0B,B,01RD,10C,0.1C,C,01RD,10C,0.0D,D,0SL,1m0,0.0E,E,0QJ,u2,0.0F,F,Wu,1qh,0.0G,G,Wu,10C,0.0H,H,14R,1Vn,0.0I,I,1pf,1vu,0.8J,J,1pf,10C,0.8K,K,2wH,10C,0.0L,L,1UP,1kQ,0.0M,M,01GC,RG,0.6N,N,01GC,0Vx,0.0O,O,03v,XX,0.4P,P,032,0i-,0.0Q,Q,2Ao,Dj,0.0R,R,1GR,017e,0.1S,S,1GR,017e,0,XY,X,Y.5T,T,2Ao,Dj,0.0U,U,31C,08I,0.0V,V,2s_,0mb,0.5W,W,31C,08I,0CH.0X,X,1ri,015V,0.0Y,Y,0e7,01Ea,0.0Z,Z,07q,01kA,0.0[,[,Ul,01AV,0.3\\,\\,Ul,01AV,0,XY,X,Y.0],],018q,02Dk,0.0^,^,01rc,01Yr,0.8_,_,022a,01MP,0.0`,`,02lM,0hW,0.Xa,a,022a,01MP,0,]^,],^.0b,b,HP,02JO,0.0c,c,0NY,02Gq,0.8d,d,0Vv,02GI,0.Xf,f,0Vv,02GI,0,bc,b,c.0g,g,1AZ,02pW,0.0h,h,2EW,01S2,0.0i,i,2s_,02g6,0.0j,j,1GR,01zf,0.0k,k,2Ao,03Qv,0.0l,l,22b,02JO,0.1m,m,22b,02JO,0,ghij,i,j.0n,n,3tQ,026J,0.8o,o,1ux,01tp,0.1p,p,1ux,01tp,0,ghij,g,h.0q,q,02tY,02sl,0.0r,r,0zX,02sl,0.0s,s,34j,01ci,0..YPBC,BC,Fe,0,0,0,,B,C,,.YRDE,DE,Fe,Fe,0RK,1K1,0d125a,D,E,,.YRFGH,FGH,Fe,Fe,ik,1SD,B2DFDB,F,G,H,,.YRIJKL,IJKL,ku,Azlti,27f,1HW,26A69A,I,J,K,L,,IJ,JK,KL.YRMN,MN,Fe,Fe,01GC,02L,303e9f,M,N,,.YROP,OP,Fe,Fe,03U,05l,0d125a,O,P,,.YRQR,QR,Fe,Fe,1jc,0S_,B2DFDB,Q,R,,.YPRS,RS,Fe,0,0,0,,R,S,,.YPQT,QT,Fe,0,0,0,,Q,T,,.YRUV,UV,Fe,Fe,2y5,0SS,26A69A,U,V,,.YPUW,UW,Fe,0,0,0,,U,W,,.YRXY,XY,Fe,Fe,cp,01A1,00695C,X,Y,,.YRZ[,Z[,Fe,Fe,BU,01SK,c5cae9,Z,[,,.YP[\\,[\\,Fe,0,0,0,,[,\\,,.YR]^,]^,Fe,Fe,01VD,01uH,303e9f,],^,,.YR_`,_`,Fe,Fe,02Oz,010z,0d125a,_,`,,.YP_a,_a,Fe,0,0,0,,_,a,,.YRbc,bc,Fe,Fe,034,02I6,B2DFDB,b,c,,.YR]d,]d,Fe,Fe,0qN,02F0,26A69A,d,],,.YPdf,df,Fe,0,0,0,,d,f,,.YRghij,ghij,Fe,Fe,1u7,02Dq,00695C,g,h,i,j,,.YRkl,kl,Fe,Fe,26h,02t9,c5cae9,k,l,,.YPlm,lm,Fe,0,0,0,,l,m,,.YRnos,nos,Fe,Fe,3ES,024-,303e9f,n,o,s,,.YPop,op,Fe,0,0,0,,o,p,,.YRqr,qr,Fe,Fe,01wX,02sl,B2DFDB,q,r,,.NRIJ,IJ,Fe,Fe,1pf,1T2,26A69A,I,J,,.NRJK,JK,Fe,Fe,2Mz,10C,00695C,J,K,,.NRKL,KL,Fe,Fe,2CL,1NJ,c5cae9,K,L,,..2F1,qr,F1,01-H,02sl,01yD,03jf,2SG.2F2,qr,F2,01Xj,02sl,0wz,03Sd,Fe.3F3,qr,F3,02WB,02sl,032z,03mG,Fe..N_a',
};
