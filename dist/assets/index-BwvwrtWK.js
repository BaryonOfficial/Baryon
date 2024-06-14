var ff=(Zi,Hn)=>()=>(Hn||Zi((Hn={exports:{}}).exports,Hn),Hn.exports);var mf=ff(Aa=>{(async()=>{(function(){const r=document.createElement("link").relList;if(!(r&&r.supports&&r.supports("modulepreload"))){for(const t of document.querySelectorAll('link[rel="modulepreload"]'))e(t);new MutationObserver(t=>{for(const n of t)if(n.type==="childList")for(const i of n.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&e(i)}).observe(document,{childList:!0,subtree:!0})}function e(t){if(t.ep)return;t.ep=!0;const n=function(i){const a={};return i.integrity&&(a.integrity=i.integrity),i.referrerPolicy&&(a.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?a.credentials="include":i.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}(t);fetch(t.href,n)}})();const Zi="165",Hn=0,Ys=1,Ks=2,Zs=0,mc=1,Js=2,gc=3,Qs=1,vc=2,vn=3,xn=0,Lt=1,xc=2,Gn=100,_c=101,yc=102,bc=200,Sc=201,Mc=202,Tc=203,wc=204,Ac=205,Ec=206,Rc=207,Cc=208,Pc=209,Lc=210,Dc=211,Uc=212,Ic=213,Nc=214,$s=0,Oc=1,Fc=2,Rn=0,Bc=1,zc=2,kc=3,Vc=4,Hc=5,Gc=6,Wc=7,eo="attached",oi=301,li=302,Cr=306,ci=1e3,Cn=1001,Pr=1002,ut=1003,jc=1004,Ji=1005,Ut=1006,Lr=1007,Wn=1008,ui=1009,Dr=1012,to=1013,hi=1014,It=1015,rn=1016,di=1020,qt=1023,Qi=1026,pi=1027,Ur=1028,Ea=33776,Ra=33777,Ca=33778,Pa=33779,La=36492,$i=2300,er=2301,Da=2302,fi="",_t="srgb",yt="srgb-linear",Ua="display-p3",Ir="display-p3-linear",Nr="linear",Ze="srgb",Or="rec709",Fr="p3",mi=7680,Xc=512,qc=513,Yc=514,Kc=515,Zc=516,Jc=517,Qc=518,$c=519,Ia=35044,no="300 es",gi=2e3,Br=2001;class jn{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;const n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;const n=this._listeners[e];if(n!==void 0){const i=n.indexOf(t);i!==-1&&n.splice(i,1)}}dispatchEvent(e){if(this._listeners===void 0)return;const t=this._listeners[e.type];if(t!==void 0){e.target=this;const n=t.slice(0);for(let i=0,a=n.length;i<a;i++)n[i].call(this,e);e.target=null}}}const St=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let io=1234567;const tr=Math.PI/180,vi=180/Math.PI;function Yt(){const r=4294967295*Math.random()|0,e=4294967295*Math.random()|0,t=4294967295*Math.random()|0,n=4294967295*Math.random()|0;return(St[255&r]+St[r>>8&255]+St[r>>16&255]+St[r>>24&255]+"-"+St[255&e]+St[e>>8&255]+"-"+St[e>>16&15|64]+St[e>>24&255]+"-"+St[63&t|128]+St[t>>8&255]+"-"+St[t>>16&255]+St[t>>24&255]+St[255&n]+St[n>>8&255]+St[n>>16&255]+St[n>>24&255]).toLowerCase()}function bt(r,e,t){return Math.max(e,Math.min(t,r))}function Na(r,e){return(r%e+e)%e}function nr(r,e,t){return(1-t)*r+t*e}function Kt(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return r/4294967295;case Uint16Array:return r/65535;case Uint8Array:return r/255;case Int32Array:return Math.max(r/2147483647,-1);case Int16Array:return Math.max(r/32767,-1);case Int8Array:return Math.max(r/127,-1);default:throw new Error("Invalid component type.")}}function He(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return Math.round(4294967295*r);case Uint16Array:return Math.round(65535*r);case Uint8Array:return Math.round(255*r);case Int32Array:return Math.round(2147483647*r);case Int16Array:return Math.round(32767*r);case Int8Array:return Math.round(127*r);default:throw new Error("Invalid component type.")}}const ro={DEG2RAD:tr,RAD2DEG:vi,generateUUID:Yt,clamp:bt,euclideanModulo:Na,mapLinear:function(r,e,t,n,i){return n+(r-e)*(i-n)/(t-e)},inverseLerp:function(r,e,t){return r!==e?(t-r)/(e-r):0},lerp:nr,damp:function(r,e,t,n){return nr(r,e,1-Math.exp(-t*n))},pingpong:function(r,e=1){return e-Math.abs(Na(r,2*e)-e)},smoothstep:function(r,e,t){return r<=e?0:r>=t?1:(r=(r-e)/(t-e))*r*(3-2*r)},smootherstep:function(r,e,t){return r<=e?0:r>=t?1:(r=(r-e)/(t-e))*r*r*(r*(6*r-15)+10)},randInt:function(r,e){return r+Math.floor(Math.random()*(e-r+1))},randFloat:function(r,e){return r+Math.random()*(e-r)},randFloatSpread:function(r){return r*(.5-Math.random())},seededRandom:function(r){r!==void 0&&(io=r);let e=io+=1831565813;return e=Math.imul(e^e>>>15,1|e),e^=e+Math.imul(e^e>>>7,61|e),((e^e>>>14)>>>0)/4294967296},degToRad:function(r){return r*tr},radToDeg:function(r){return r*vi},isPowerOfTwo:function(r){return!(r&r-1)&&r!==0},ceilPowerOfTwo:function(r){return Math.pow(2,Math.ceil(Math.log(r)/Math.LN2))},floorPowerOfTwo:function(r){return Math.pow(2,Math.floor(Math.log(r)/Math.LN2))},setQuaternionFromProperEuler:function(r,e,t,n,i){const a=Math.cos,s=Math.sin,o=a(t/2),l=s(t/2),c=a((e+n)/2),u=s((e+n)/2),h=a((e-n)/2),d=s((e-n)/2),p=a((n-e)/2),v=s((n-e)/2);switch(i){case"XYX":r.set(o*u,l*h,l*d,o*c);break;case"YZY":r.set(l*d,o*u,l*h,o*c);break;case"ZXZ":r.set(l*h,l*d,o*u,o*c);break;case"XZX":r.set(o*u,l*v,l*p,o*c);break;case"YXY":r.set(l*p,o*u,l*v,o*c);break;case"ZYZ":r.set(l*v,l*p,o*u,o*c)}},normalize:He,denormalize:Kt};class _e{constructor(e=0,t=0){_e.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(bt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),i=Math.sin(t),a=this.x-e.x,s=this.y-e.y;return this.x=a*n-s*i+e.x,this.y=a*i+s*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Le{constructor(e,t,n,i,a,s,o,l,c){Le.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,a,s,o,l,c)}set(e,t,n,i,a,s,o,l,c){const u=this.elements;return u[0]=e,u[1]=i,u[2]=o,u[3]=t,u[4]=a,u[5]=l,u[6]=n,u[7]=s,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,i=t.elements,a=this.elements,s=n[0],o=n[3],l=n[6],c=n[1],u=n[4],h=n[7],d=n[2],p=n[5],v=n[8],x=i[0],f=i[3],_=i[6],m=i[1],b=i[4],P=i[7],Y=i[2],D=i[5],G=i[8];return a[0]=s*x+o*m+l*Y,a[3]=s*f+o*b+l*D,a[6]=s*_+o*P+l*G,a[1]=c*x+u*m+h*Y,a[4]=c*f+u*b+h*D,a[7]=c*_+u*P+h*G,a[2]=d*x+p*m+v*Y,a[5]=d*f+p*b+v*D,a[8]=d*_+p*P+v*G,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],i=e[2],a=e[3],s=e[4],o=e[5],l=e[6],c=e[7],u=e[8];return t*s*u-t*o*c-n*a*u+n*o*l+i*a*c-i*s*l}invert(){const e=this.elements,t=e[0],n=e[1],i=e[2],a=e[3],s=e[4],o=e[5],l=e[6],c=e[7],u=e[8],h=u*s-o*c,d=o*l-u*a,p=c*a-s*l,v=t*h+n*d+i*p;if(v===0)return this.set(0,0,0,0,0,0,0,0,0);const x=1/v;return e[0]=h*x,e[1]=(i*c-u*n)*x,e[2]=(o*n-i*s)*x,e[3]=d*x,e[4]=(u*t-i*l)*x,e[5]=(i*a-o*t)*x,e[6]=p*x,e[7]=(n*l-c*t)*x,e[8]=(s*t-n*a)*x,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,a,s,o){const l=Math.cos(a),c=Math.sin(a);return this.set(n*l,n*c,-n*(l*s+c*o)+s+e,-i*c,i*l,-i*(-c*s+l*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(Oa.makeScale(e,t)),this}rotate(e){return this.premultiply(Oa.makeRotation(-e)),this}translate(e,t){return this.premultiply(Oa.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const Oa=new Le;function ao(r){for(let e=r.length-1;e>=0;--e)if(r[e]>=65535)return!0;return!1}function ir(r){return document.createElementNS("http://www.w3.org/1999/xhtml",r)}function eu(){const r=ir("canvas");return r.style.display="block",r}const so={};function Fa(r){r in so||(so[r]=!0)}const oo=new Le().set(.8224621,.177538,0,.0331941,.9668058,0,.0170827,.0723974,.9105199),lo=new Le().set(1.2249401,-.2249404,0,-.0420569,1.0420571,0,-.0196376,-.0786361,1.0982735),zr={[yt]:{transfer:Nr,primaries:Or,toReference:r=>r,fromReference:r=>r},[_t]:{transfer:Ze,primaries:Or,toReference:r=>r.convertSRGBToLinear(),fromReference:r=>r.convertLinearToSRGB()},[Ir]:{transfer:Nr,primaries:Fr,toReference:r=>r.applyMatrix3(lo),fromReference:r=>r.applyMatrix3(oo)},[Ua]:{transfer:Ze,primaries:Fr,toReference:r=>r.convertSRGBToLinear().applyMatrix3(lo),fromReference:r=>r.applyMatrix3(oo).convertLinearToSRGB()}},tu=new Set([yt,Ir]),Ve={enabled:!0,_workingColorSpace:yt,get workingColorSpace(){return this._workingColorSpace},set workingColorSpace(r){if(!tu.has(r))throw new Error(`Unsupported working color space, "${r}".`);this._workingColorSpace=r},convert:function(r,e,t){if(this.enabled===!1||e===t||!e||!t)return r;const n=zr[e].toReference;return(0,zr[t].fromReference)(n(r))},fromWorkingColorSpace:function(r,e){return this.convert(r,this._workingColorSpace,e)},toWorkingColorSpace:function(r,e){return this.convert(r,e,this._workingColorSpace)},getPrimaries:function(r){return zr[r].primaries},getTransfer:function(r){return r===fi?Nr:zr[r].transfer}};function xi(r){return r<.04045?.0773993808*r:Math.pow(.9478672986*r+.0521327014,2.4)}function Ba(r){return r<.0031308?12.92*r:1.055*Math.pow(r,.41666)-.055}let _i;class nu{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{_i===void 0&&(_i=ir("canvas")),_i.width=e.width,_i.height=e.height;const n=_i.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=_i}return t.width>2048||t.height>2048?t.toDataURL("image/jpeg",.6):t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=ir("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const i=n.getImageData(0,0,e.width,e.height),a=i.data;for(let s=0;s<a.length;s++)a[s]=255*xi(a[s]/255);return n.putImageData(i,0,0),t}if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(255*xi(t[n]/255)):t[n]=xi(t[n]);return{data:t,width:e.width,height:e.height}}return e}}let iu=0;class co{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:iu++}),this.uuid=Yt(),this.data=e,this.dataReady=!0,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let a;if(Array.isArray(i)){a=[];for(let s=0,o=i.length;s<o;s++)i[s].isDataTexture?a.push(za(i[s].image)):a.push(za(i[s]))}else a=za(i);n.url=a}return t||(e.images[this.uuid]=n),n}}function za(r){return typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&r instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&r instanceof ImageBitmap?nu.getDataURL(r):r.data?{data:Array.from(r.data),width:r.width,height:r.height,type:r.data.constructor.name}:{}}let ru=0;class nt extends jn{constructor(e=nt.DEFAULT_IMAGE,t=nt.DEFAULT_MAPPING,n=1001,i=1001,a=1006,s=1008,o=1023,l=1009,c=nt.DEFAULT_ANISOTROPY,u=""){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:ru++}),this.uuid=Yt(),this.name="",this.source=new co(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=a,this.minFilter=s,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new _e(0,0),this.repeat=new _e(1,1),this.center=new _e(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Le,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==300)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case ci:e.x=e.x-Math.floor(e.x);break;case Cn:e.x=e.x<0?0:1;break;case Pr:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case ci:e.y=e.y-Math.floor(e.y);break;case Cn:e.y=e.y<0?0:1;break;case Pr:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}nt.DEFAULT_IMAGE=null,nt.DEFAULT_MAPPING=300,nt.DEFAULT_ANISOTROPY=1;class je{constructor(e=0,t=0,n=0,i=1){je.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,i=this.z,a=this.w,s=e.elements;return this.x=s[0]*t+s[4]*n+s[8]*i+s[12]*a,this.y=s[1]*t+s[5]*n+s[9]*i+s[13]*a,this.z=s[2]*t+s[6]*n+s[10]*i+s[14]*a,this.w=s[3]*t+s[7]*n+s[11]*i+s[15]*a,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,a;const l=e.elements,c=l[0],u=l[4],h=l[8],d=l[1],p=l[5],v=l[9],x=l[2],f=l[6],_=l[10];if(Math.abs(u-d)<.01&&Math.abs(h-x)<.01&&Math.abs(v-f)<.01){if(Math.abs(u+d)<.1&&Math.abs(h+x)<.1&&Math.abs(v+f)<.1&&Math.abs(c+p+_-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const b=(c+1)/2,P=(p+1)/2,Y=(_+1)/2,D=(u+d)/4,G=(h+x)/4,X=(v+f)/4;return b>P&&b>Y?b<.01?(n=0,i=.707106781,a=.707106781):(n=Math.sqrt(b),i=D/n,a=G/n):P>Y?P<.01?(n=.707106781,i=0,a=.707106781):(i=Math.sqrt(P),n=D/i,a=X/i):Y<.01?(n=.707106781,i=.707106781,a=0):(a=Math.sqrt(Y),n=G/a,i=X/a),this.set(n,i,a,t),this}let m=Math.sqrt((f-v)*(f-v)+(h-x)*(h-x)+(d-u)*(d-u));return Math.abs(m)<.001&&(m=1),this.x=(f-v)/m,this.y=(h-x)/m,this.z=(d-u)/m,this.w=Math.acos((c+p+_-1)/2),this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class au extends jn{constructor(e=1,t=1,n={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new je(0,0,e,t),this.scissorTest=!1,this.viewport=new je(0,0,e,t);const i={width:e,height:t,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Ut,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);const a=new nt(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);a.flipY=!1,a.generateMipmaps=n.generateMipmaps,a.internalFormat=n.internalFormat,this.textures=[];const s=n.count;for(let o=0;o<s;o++)this.textures[o]=a.clone(),this.textures[o].isRenderTargetTexture=!0;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,a=this.textures.length;i<a;i++)this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let n=0,i=e.textures.length;n<i;n++)this.textures[n]=e.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0;const t=Object.assign({},e.texture.image);return this.texture.source=new co(t),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Tt extends au{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class uo extends nt{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=ut,this.minFilter=ut,this.wrapR=Cn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class su extends nt{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=ut,this.minFilter=ut,this.wrapR=Cn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Zt{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,a,s,o){let l=n[i+0],c=n[i+1],u=n[i+2],h=n[i+3];const d=a[s+0],p=a[s+1],v=a[s+2],x=a[s+3];if(o===0)return e[t+0]=l,e[t+1]=c,e[t+2]=u,void(e[t+3]=h);if(o===1)return e[t+0]=d,e[t+1]=p,e[t+2]=v,void(e[t+3]=x);if(h!==x||l!==d||c!==p||u!==v){let f=1-o;const _=l*d+c*p+u*v+h*x,m=_>=0?1:-1,b=1-_*_;if(b>Number.EPSILON){const Y=Math.sqrt(b),D=Math.atan2(Y,_*m);f=Math.sin(f*D)/Y,o=Math.sin(o*D)/Y}const P=o*m;if(l=l*f+d*P,c=c*f+p*P,u=u*f+v*P,h=h*f+x*P,f===1-o){const Y=1/Math.sqrt(l*l+c*c+u*u+h*h);l*=Y,c*=Y,u*=Y,h*=Y}}e[t]=l,e[t+1]=c,e[t+2]=u,e[t+3]=h}static multiplyQuaternionsFlat(e,t,n,i,a,s){const o=n[i],l=n[i+1],c=n[i+2],u=n[i+3],h=a[s],d=a[s+1],p=a[s+2],v=a[s+3];return e[t]=o*v+u*h+l*p-c*d,e[t+1]=l*v+u*d+c*h-o*p,e[t+2]=c*v+u*p+o*d-l*h,e[t+3]=u*v-o*h-l*d-c*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,i=e._y,a=e._z,s=e._order,o=Math.cos,l=Math.sin,c=o(n/2),u=o(i/2),h=o(a/2),d=l(n/2),p=l(i/2),v=l(a/2);switch(s){case"XYZ":this._x=d*u*h+c*p*v,this._y=c*p*h-d*u*v,this._z=c*u*v+d*p*h,this._w=c*u*h-d*p*v;break;case"YXZ":this._x=d*u*h+c*p*v,this._y=c*p*h-d*u*v,this._z=c*u*v-d*p*h,this._w=c*u*h+d*p*v;break;case"ZXY":this._x=d*u*h-c*p*v,this._y=c*p*h+d*u*v,this._z=c*u*v+d*p*h,this._w=c*u*h-d*p*v;break;case"ZYX":this._x=d*u*h-c*p*v,this._y=c*p*h+d*u*v,this._z=c*u*v-d*p*h,this._w=c*u*h+d*p*v;break;case"YZX":this._x=d*u*h+c*p*v,this._y=c*p*h+d*u*v,this._z=c*u*v-d*p*h,this._w=c*u*h-d*p*v;break;case"XZY":this._x=d*u*h-c*p*v,this._y=c*p*h-d*u*v,this._z=c*u*v+d*p*h,this._w=c*u*h+d*p*v}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],i=t[4],a=t[8],s=t[1],o=t[5],l=t[9],c=t[2],u=t[6],h=t[10],d=n+o+h;if(d>0){const p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(u-l)*p,this._y=(a-c)*p,this._z=(s-i)*p}else if(n>o&&n>h){const p=2*Math.sqrt(1+n-o-h);this._w=(u-l)/p,this._x=.25*p,this._y=(i+s)/p,this._z=(a+c)/p}else if(o>h){const p=2*Math.sqrt(1+o-n-h);this._w=(a-c)/p,this._x=(i+s)/p,this._y=.25*p,this._z=(l+u)/p}else{const p=2*Math.sqrt(1+h-n-o);this._w=(s-i)/p,this._x=(a+c)/p,this._y=(l+u)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(bt(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,i=e._y,a=e._z,s=e._w,o=t._x,l=t._y,c=t._z,u=t._w;return this._x=n*u+s*o+i*c-a*l,this._y=i*u+s*l+a*o-n*c,this._z=a*u+s*c+n*l-i*o,this._w=s*u-n*o-i*l-a*c,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);const n=this._x,i=this._y,a=this._z,s=this._w;let o=s*e._w+n*e._x+i*e._y+a*e._z;if(o<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,o=-o):this.copy(e),o>=1)return this._w=s,this._x=n,this._y=i,this._z=a,this;const l=1-o*o;if(l<=Number.EPSILON){const p=1-t;return this._w=p*s+t*this._w,this._x=p*n+t*this._x,this._y=p*i+t*this._y,this._z=p*a+t*this._z,this.normalize(),this}const c=Math.sqrt(l),u=Math.atan2(c,o),h=Math.sin((1-t)*u)/c,d=Math.sin(t*u)/c;return this._w=s*h+this._w*d,this._x=n*h+this._x*d,this._y=i*h+this._y*d,this._z=a*h+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),a=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),a*Math.sin(t),a*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class z{constructor(e=0,t=0,n=0){z.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(ho.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(ho.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,i=this.z,a=e.elements;return this.x=a[0]*t+a[3]*n+a[6]*i,this.y=a[1]*t+a[4]*n+a[7]*i,this.z=a[2]*t+a[5]*n+a[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,i=this.z,a=e.elements,s=1/(a[3]*t+a[7]*n+a[11]*i+a[15]);return this.x=(a[0]*t+a[4]*n+a[8]*i+a[12])*s,this.y=(a[1]*t+a[5]*n+a[9]*i+a[13])*s,this.z=(a[2]*t+a[6]*n+a[10]*i+a[14])*s,this}applyQuaternion(e){const t=this.x,n=this.y,i=this.z,a=e.x,s=e.y,o=e.z,l=e.w,c=2*(s*i-o*n),u=2*(o*t-a*i),h=2*(a*n-s*t);return this.x=t+l*c+s*h-o*u,this.y=n+l*u+o*c-a*h,this.z=i+l*h+a*u-s*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,i=this.z,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*i,this.y=a[1]*t+a[5]*n+a[9]*i,this.z=a[2]*t+a[6]*n+a[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,i=e.y,a=e.z,s=t.x,o=t.y,l=t.z;return this.x=i*l-a*o,this.y=a*s-n*l,this.z=n*o-i*s,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return ka.copy(this).projectOnVector(e),this.sub(ka)}reflect(e){return this.sub(ka.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(bt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,4*t)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,3*t)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=2*Math.random()-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const ka=new z,ho=new Zt;class _n{constructor(e=new z(1/0,1/0,1/0),t=new z(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Jt.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Jt.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=Jt.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const a=n.getAttribute("position");if(t===!0&&a!==void 0&&e.isInstancedMesh!==!0)for(let s=0,o=a.count;s<o;s++)e.isMesh===!0?e.getVertexPosition(s,Jt):Jt.fromBufferAttribute(a,s),Jt.applyMatrix4(e.matrixWorld),this.expandByPoint(Jt);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),kr.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),kr.copy(n.boundingBox)),kr.applyMatrix4(e.matrixWorld),this.union(kr)}const i=e.children;for(let a=0,s=i.length;a<s;a++)this.expandByObject(i[a],t);return this}containsPoint(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y||e.z<this.min.z||e.z>this.max.z)}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y||e.max.z<this.min.z||e.min.z>this.max.z)}intersectsSphere(e){return this.clampPoint(e.center,Jt),Jt.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(rr),Vr.subVectors(this.max,rr),yi.subVectors(e.a,rr),bi.subVectors(e.b,rr),Si.subVectors(e.c,rr),Pn.subVectors(bi,yi),Ln.subVectors(Si,bi),Xn.subVectors(yi,Si);let t=[0,-Pn.z,Pn.y,0,-Ln.z,Ln.y,0,-Xn.z,Xn.y,Pn.z,0,-Pn.x,Ln.z,0,-Ln.x,Xn.z,0,-Xn.x,-Pn.y,Pn.x,0,-Ln.y,Ln.x,0,-Xn.y,Xn.x,0];return!!Va(t,yi,bi,Si,Vr)&&(t=[1,0,0,0,1,0,0,0,1],!!Va(t,yi,bi,Si,Vr)&&(Hr.crossVectors(Pn,Ln),t=[Hr.x,Hr.y,Hr.z],Va(t,yi,bi,Si,Vr)))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Jt).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=.5*this.getSize(Jt).length()),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()||(yn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),yn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),yn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),yn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),yn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),yn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),yn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),yn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(yn)),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}}const yn=[new z,new z,new z,new z,new z,new z,new z,new z],Jt=new z,kr=new _n,yi=new z,bi=new z,Si=new z,Pn=new z,Ln=new z,Xn=new z,rr=new z,Vr=new z,Hr=new z,qn=new z;function Va(r,e,t,n,i){for(let a=0,s=r.length-3;a<=s;a+=3){qn.fromArray(r,a);const o=i.x*Math.abs(qn.x)+i.y*Math.abs(qn.y)+i.z*Math.abs(qn.z),l=e.dot(qn),c=t.dot(qn),u=n.dot(qn);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>o)return!1}return!0}const ou=new _n,ar=new z,Ha=new z;class an{constructor(e=new z,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):ou.setFromPoints(e).getCenter(n);let i=0;for(let a=0,s=e.length;a<s;a++)i=Math.max(i,n.distanceToSquared(e[a]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;ar.subVectors(e,this.center);const t=ar.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),i=.5*(n-this.radius);this.center.addScaledVector(ar,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Ha.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(ar.copy(e.center).add(Ha)),this.expandByPoint(ar.copy(e.center).sub(Ha))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}}const bn=new z,Ga=new z,Gr=new z,Dn=new z,Wa=new z,Wr=new z,ja=new z;class sr{constructor(e=new z,t=new z(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,bn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=bn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(bn.copy(this.origin).addScaledVector(this.direction,t),bn.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){Ga.copy(e).add(t).multiplyScalar(.5),Gr.copy(t).sub(e).normalize(),Dn.copy(this.origin).sub(Ga);const a=.5*e.distanceTo(t),s=-this.direction.dot(Gr),o=Dn.dot(this.direction),l=-Dn.dot(Gr),c=Dn.lengthSq(),u=Math.abs(1-s*s);let h,d,p,v;if(u>0)if(h=s*l-o,d=s*o-l,v=a*u,h>=0)if(d>=-v)if(d<=v){const x=1/u;h*=x,d*=x,p=h*(h+s*d+2*o)+d*(s*h+d+2*l)+c}else d=a,h=Math.max(0,-(s*d+o)),p=-h*h+d*(d+2*l)+c;else d=-a,h=Math.max(0,-(s*d+o)),p=-h*h+d*(d+2*l)+c;else d<=-v?(h=Math.max(0,-(-s*a+o)),d=h>0?-a:Math.min(Math.max(-a,-l),a),p=-h*h+d*(d+2*l)+c):d<=v?(h=0,d=Math.min(Math.max(-a,-l),a),p=d*(d+2*l)+c):(h=Math.max(0,-(s*a+o)),d=h>0?a:Math.min(Math.max(-a,-l),a),p=-h*h+d*(d+2*l)+c);else d=s>0?-a:a,h=Math.max(0,-(s*d+o)),p=-h*h+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,h),i&&i.copy(Ga).addScaledVector(Gr,d),p}intersectSphere(e,t){bn.subVectors(e.center,this.origin);const n=bn.dot(this.direction),i=bn.dot(bn)-n*n,a=e.radius*e.radius;if(i>a)return null;const s=Math.sqrt(a-i),o=n-s,l=n+s;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0?!0:e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,a,s,o,l;const c=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,i=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,i=(e.min.x-d.x)*c),u>=0?(a=(e.min.y-d.y)*u,s=(e.max.y-d.y)*u):(a=(e.max.y-d.y)*u,s=(e.min.y-d.y)*u),n>s||a>i?null:((a>n||isNaN(n))&&(n=a),(s<i||isNaN(i))&&(i=s),h>=0?(o=(e.min.z-d.z)*h,l=(e.max.z-d.z)*h):(o=(e.max.z-d.z)*h,l=(e.min.z-d.z)*h),n>l||o>i?null:((o>n||n!=n)&&(n=o),(l<i||i!=i)&&(i=l),i<0?null:this.at(n>=0?n:i,t)))}intersectsBox(e){return this.intersectBox(e,bn)!==null}intersectTriangle(e,t,n,i,a){Wa.subVectors(t,e),Wr.subVectors(n,e),ja.crossVectors(Wa,Wr);let s,o=this.direction.dot(ja);if(o>0){if(i)return null;s=1}else{if(!(o<0))return null;s=-1,o=-o}Dn.subVectors(this.origin,e);const l=s*this.direction.dot(Wr.crossVectors(Dn,Wr));if(l<0)return null;const c=s*this.direction.dot(Wa.cross(Dn));if(c<0||l+c>o)return null;const u=-s*Dn.dot(ja);return u<0?null:this.at(u/o,a)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Pe{constructor(e,t,n,i,a,s,o,l,c,u,h,d,p,v,x,f){Pe.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,a,s,o,l,c,u,h,d,p,v,x,f)}set(e,t,n,i,a,s,o,l,c,u,h,d,p,v,x,f){const _=this.elements;return _[0]=e,_[4]=t,_[8]=n,_[12]=i,_[1]=a,_[5]=s,_[9]=o,_[13]=l,_[2]=c,_[6]=u,_[10]=h,_[14]=d,_[3]=p,_[7]=v,_[11]=x,_[15]=f,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Pe().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){const t=this.elements,n=e.elements,i=1/Mi.setFromMatrixColumn(e,0).length(),a=1/Mi.setFromMatrixColumn(e,1).length(),s=1/Mi.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*a,t[5]=n[5]*a,t[6]=n[6]*a,t[7]=0,t[8]=n[8]*s,t[9]=n[9]*s,t[10]=n[10]*s,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,i=e.y,a=e.z,s=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),u=Math.cos(a),h=Math.sin(a);if(e.order==="XYZ"){const d=s*u,p=s*h,v=o*u,x=o*h;t[0]=l*u,t[4]=-l*h,t[8]=c,t[1]=p+v*c,t[5]=d-x*c,t[9]=-o*l,t[2]=x-d*c,t[6]=v+p*c,t[10]=s*l}else if(e.order==="YXZ"){const d=l*u,p=l*h,v=c*u,x=c*h;t[0]=d+x*o,t[4]=v*o-p,t[8]=s*c,t[1]=s*h,t[5]=s*u,t[9]=-o,t[2]=p*o-v,t[6]=x+d*o,t[10]=s*l}else if(e.order==="ZXY"){const d=l*u,p=l*h,v=c*u,x=c*h;t[0]=d-x*o,t[4]=-s*h,t[8]=v+p*o,t[1]=p+v*o,t[5]=s*u,t[9]=x-d*o,t[2]=-s*c,t[6]=o,t[10]=s*l}else if(e.order==="ZYX"){const d=s*u,p=s*h,v=o*u,x=o*h;t[0]=l*u,t[4]=v*c-p,t[8]=d*c+x,t[1]=l*h,t[5]=x*c+d,t[9]=p*c-v,t[2]=-c,t[6]=o*l,t[10]=s*l}else if(e.order==="YZX"){const d=s*l,p=s*c,v=o*l,x=o*c;t[0]=l*u,t[4]=x-d*h,t[8]=v*h+p,t[1]=h,t[5]=s*u,t[9]=-o*u,t[2]=-c*u,t[6]=p*h+v,t[10]=d-x*h}else if(e.order==="XZY"){const d=s*l,p=s*c,v=o*l,x=o*c;t[0]=l*u,t[4]=-h,t[8]=c*u,t[1]=d*h+x,t[5]=s*u,t[9]=p*h-v,t[2]=v*h-p,t[6]=o*u,t[10]=x*h+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(lu,e,cu)}lookAt(e,t,n){const i=this.elements;return Nt.subVectors(e,t),Nt.lengthSq()===0&&(Nt.z=1),Nt.normalize(),Un.crossVectors(n,Nt),Un.lengthSq()===0&&(Math.abs(n.z)===1?Nt.x+=1e-4:Nt.z+=1e-4,Nt.normalize(),Un.crossVectors(n,Nt)),Un.normalize(),jr.crossVectors(Nt,Un),i[0]=Un.x,i[4]=jr.x,i[8]=Nt.x,i[1]=Un.y,i[5]=jr.y,i[9]=Nt.y,i[2]=Un.z,i[6]=jr.z,i[10]=Nt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,i=t.elements,a=this.elements,s=n[0],o=n[4],l=n[8],c=n[12],u=n[1],h=n[5],d=n[9],p=n[13],v=n[2],x=n[6],f=n[10],_=n[14],m=n[3],b=n[7],P=n[11],Y=n[15],D=i[0],G=i[4],X=i[8],j=i[12],K=i[1],ae=i[5],$=i[9],se=i[13],J=i[2],ce=i[6],re=i[10],de=i[14],E=i[3],g=i[7],T=i[11],U=i[15];return a[0]=s*D+o*K+l*J+c*E,a[4]=s*G+o*ae+l*ce+c*g,a[8]=s*X+o*$+l*re+c*T,a[12]=s*j+o*se+l*de+c*U,a[1]=u*D+h*K+d*J+p*E,a[5]=u*G+h*ae+d*ce+p*g,a[9]=u*X+h*$+d*re+p*T,a[13]=u*j+h*se+d*de+p*U,a[2]=v*D+x*K+f*J+_*E,a[6]=v*G+x*ae+f*ce+_*g,a[10]=v*X+x*$+f*re+_*T,a[14]=v*j+x*se+f*de+_*U,a[3]=m*D+b*K+P*J+Y*E,a[7]=m*G+b*ae+P*ce+Y*g,a[11]=m*X+b*$+P*re+Y*T,a[15]=m*j+b*se+P*de+Y*U,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],i=e[8],a=e[12],s=e[1],o=e[5],l=e[9],c=e[13],u=e[2],h=e[6],d=e[10],p=e[14];return e[3]*(+a*l*h-i*c*h-a*o*d+n*c*d+i*o*p-n*l*p)+e[7]*(+t*l*p-t*c*d+a*s*d-i*s*p+i*c*u-a*l*u)+e[11]*(+t*c*h-t*o*p-a*s*h+n*s*p+a*o*u-n*c*u)+e[15]*(-i*o*u-t*l*h+t*o*d+i*s*h-n*s*d+n*l*u)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],i=e[2],a=e[3],s=e[4],o=e[5],l=e[6],c=e[7],u=e[8],h=e[9],d=e[10],p=e[11],v=e[12],x=e[13],f=e[14],_=e[15],m=h*f*c-x*d*c+x*l*p-o*f*p-h*l*_+o*d*_,b=v*d*c-u*f*c-v*l*p+s*f*p+u*l*_-s*d*_,P=u*x*c-v*h*c+v*o*p-s*x*p-u*o*_+s*h*_,Y=v*h*l-u*x*l-v*o*d+s*x*d+u*o*f-s*h*f,D=t*m+n*b+i*P+a*Y;if(D===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const G=1/D;return e[0]=m*G,e[1]=(x*d*a-h*f*a-x*i*p+n*f*p+h*i*_-n*d*_)*G,e[2]=(o*f*a-x*l*a+x*i*c-n*f*c-o*i*_+n*l*_)*G,e[3]=(h*l*a-o*d*a-h*i*c+n*d*c+o*i*p-n*l*p)*G,e[4]=b*G,e[5]=(u*f*a-v*d*a+v*i*p-t*f*p-u*i*_+t*d*_)*G,e[6]=(v*l*a-s*f*a-v*i*c+t*f*c+s*i*_-t*l*_)*G,e[7]=(s*d*a-u*l*a+u*i*c-t*d*c-s*i*p+t*l*p)*G,e[8]=P*G,e[9]=(v*h*a-u*x*a-v*n*p+t*x*p+u*n*_-t*h*_)*G,e[10]=(s*x*a-v*o*a+v*n*c-t*x*c-s*n*_+t*o*_)*G,e[11]=(u*o*a-s*h*a-u*n*c+t*h*c+s*n*p-t*o*p)*G,e[12]=Y*G,e[13]=(u*x*i-v*h*i+v*n*d-t*x*d-u*n*f+t*h*f)*G,e[14]=(v*o*i-s*x*i-v*n*l+t*x*l+s*n*f-t*o*f)*G,e[15]=(s*h*i-u*o*i+u*n*l-t*h*l-s*n*d+t*o*d)*G,this}scale(e){const t=this.elements,n=e.x,i=e.y,a=e.z;return t[0]*=n,t[4]*=i,t[8]*=a,t[1]*=n,t[5]*=i,t[9]*=a,t[2]*=n,t[6]*=i,t[10]*=a,t[3]*=n,t[7]*=i,t[11]*=a,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),i=Math.sin(t),a=1-n,s=e.x,o=e.y,l=e.z,c=a*s,u=a*o;return this.set(c*s+n,c*o-i*l,c*l+i*o,0,c*o+i*l,u*o+n,u*l-i*s,0,c*l-i*o,u*l+i*s,a*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,a,s){return this.set(1,n,a,0,e,1,s,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){const i=this.elements,a=t._x,s=t._y,o=t._z,l=t._w,c=a+a,u=s+s,h=o+o,d=a*c,p=a*u,v=a*h,x=s*u,f=s*h,_=o*h,m=l*c,b=l*u,P=l*h,Y=n.x,D=n.y,G=n.z;return i[0]=(1-(x+_))*Y,i[1]=(p+P)*Y,i[2]=(v-b)*Y,i[3]=0,i[4]=(p-P)*D,i[5]=(1-(d+_))*D,i[6]=(f+m)*D,i[7]=0,i[8]=(v+b)*G,i[9]=(f-m)*G,i[10]=(1-(d+x))*G,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){const i=this.elements;let a=Mi.set(i[0],i[1],i[2]).length();const s=Mi.set(i[4],i[5],i[6]).length(),o=Mi.set(i[8],i[9],i[10]).length();this.determinant()<0&&(a=-a),e.x=i[12],e.y=i[13],e.z=i[14],Qt.copy(this);const l=1/a,c=1/s,u=1/o;return Qt.elements[0]*=l,Qt.elements[1]*=l,Qt.elements[2]*=l,Qt.elements[4]*=c,Qt.elements[5]*=c,Qt.elements[6]*=c,Qt.elements[8]*=u,Qt.elements[9]*=u,Qt.elements[10]*=u,t.setFromRotationMatrix(Qt),n.x=a,n.y=s,n.z=o,this}makePerspective(e,t,n,i,a,s,o=2e3){const l=this.elements,c=2*a/(t-e),u=2*a/(n-i),h=(t+e)/(t-e),d=(n+i)/(n-i);let p,v;if(o===gi)p=-(s+a)/(s-a),v=-2*s*a/(s-a);else{if(o!==Br)throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);p=-s/(s-a),v=-s*a/(s-a)}return l[0]=c,l[4]=0,l[8]=h,l[12]=0,l[1]=0,l[5]=u,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=p,l[14]=v,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,n,i,a,s,o=2e3){const l=this.elements,c=1/(t-e),u=1/(n-i),h=1/(s-a),d=(t+e)*c,p=(n+i)*u;let v,x;if(o===gi)v=(s+a)*h,x=-2*h;else{if(o!==Br)throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);v=a*h,x=-1*h}return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-d,l[1]=0,l[5]=2*u,l[9]=0,l[13]=-p,l[2]=0,l[6]=0,l[10]=x,l[14]=-v,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const Mi=new z,Qt=new Pe,lu=new z(0,0,0),cu=new z(1,1,1),Un=new z,jr=new z,Nt=new z,po=new Pe,fo=new Zt;class sn{constructor(e=0,t=0,n=0,i=sn.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const i=e.elements,a=i[0],s=i[4],o=i[8],l=i[1],c=i[5],u=i[9],h=i[2],d=i[6],p=i[10];switch(t){case"XYZ":this._y=Math.asin(bt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,p),this._z=Math.atan2(-s,a)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-bt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-h,a),this._z=0);break;case"ZXY":this._x=Math.asin(bt(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-h,p),this._z=Math.atan2(-s,c)):(this._y=0,this._z=Math.atan2(l,a));break;case"ZYX":this._y=Math.asin(-bt(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(l,a)):(this._x=0,this._z=Math.atan2(-s,c));break;case"YZX":this._z=Math.asin(bt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-h,a)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-bt(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,a)):(this._x=Math.atan2(-u,p),this._y=0)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return po.makeRotationFromQuaternion(e),this.setFromRotationMatrix(po,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return fo.setFromEuler(this),this.setFromQuaternion(fo,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}sn.DEFAULT_ORDER="XYZ";class mo{constructor(){this.mask=1}set(e){this.mask=1<<e>>>0}enable(e){this.mask|=1<<e}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e}disable(e){this.mask&=~(1<<e)}disableAll(){this.mask=0}test(e){return!!(this.mask&e.mask)}isEnabled(e){return!!(this.mask&1<<e)}}let uu=0;const go=new z,Ti=new Zt,Sn=new Pe,Xr=new z,or=new z,hu=new z,du=new Zt,vo=new z(1,0,0),xo=new z(0,1,0),_o=new z(0,0,1),yo={type:"added"},pu={type:"removed"},wi={type:"childadded",child:null},Xa={type:"childremoved",child:null};class qe extends jn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:uu++}),this.uuid=Yt(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=qe.DEFAULT_UP.clone();const e=new z,t=new sn,n=new Zt,i=new z(1,1,1);t._onChange(function(){n.setFromEuler(t,!1)}),n._onChange(function(){t.setFromQuaternion(n,void 0,!1)}),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Pe},normalMatrix:{value:new Le}}),this.matrix=new Pe,this.matrixWorld=new Pe,this.matrixAutoUpdate=qe.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=qe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new mo,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ti.setFromAxisAngle(e,t),this.quaternion.multiply(Ti),this}rotateOnWorldAxis(e,t){return Ti.setFromAxisAngle(e,t),this.quaternion.premultiply(Ti),this}rotateX(e){return this.rotateOnAxis(vo,e)}rotateY(e){return this.rotateOnAxis(xo,e)}rotateZ(e){return this.rotateOnAxis(_o,e)}translateOnAxis(e,t){return go.copy(e).applyQuaternion(this.quaternion),this.position.add(go.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(vo,e)}translateY(e){return this.translateOnAxis(xo,e)}translateZ(e){return this.translateOnAxis(_o,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Sn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Xr.copy(e):Xr.set(e,t,n);const i=this.parent;this.updateWorldMatrix(!0,!1),or.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Sn.lookAt(or,Xr,this.up):Sn.lookAt(Xr,or,this.up),this.quaternion.setFromRotationMatrix(Sn),i&&(Sn.extractRotation(i.matrixWorld),Ti.setFromRotationMatrix(Sn),this.quaternion.premultiply(Ti.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this||e&&e.isObject3D&&(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(yo),wi.child=e,this.dispatchEvent(wi),wi.child=null),this}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(pu),Xa.child=e,this.dispatchEvent(Xa),Xa.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Sn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Sn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Sn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(yo),wi.child=e,this.dispatchEvent(wi),wi.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const i=this.children;for(let a=0,s=i.length;a<s;a++)i[a].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(or,e,hu),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(or,du,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,i=t.length;n<i;n++){const a=t[n];a.matrixWorldAutoUpdate!==!0&&e!==!0||a.updateMatrixWorld(e)}}updateWorldMatrix(e,t){const n=this.parent;if(e===!0&&n!==null&&n.matrixWorldAutoUpdate===!0&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),t===!0){const i=this.children;for(let a=0,s=i.length;a<s;a++){const o=i[a];o.matrixWorldAutoUpdate===!0&&o.updateWorldMatrix(!1,!0)}}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});const i={};function a(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(o=>({boxInitialized:o.boxInitialized,boxMin:o.box.min.toArray(),boxMax:o.box.max.toArray(),sphereInitialized:o.sphereInitialized,sphereRadius:o.sphere.radius,sphereCenter:o.sphere.center.toArray()})),i.maxGeometryCount=this._maxGeometryCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(e),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()})),this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=a(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){const h=l[c];a(e.shapes,h)}else a(e.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(a(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(a(e.materials,this.material[l]));i.material=o}else i.material=a(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];i.animations.push(a(e.animations,l))}}if(t){const o=s(e.geometries),l=s(e.materials),c=s(e.textures),u=s(e.images),h=s(e.shapes),d=s(e.skeletons),p=s(e.animations),v=s(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),u.length>0&&(n.images=u),h.length>0&&(n.shapes=h),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),v.length>0&&(n.nodes=v)}return n.object=i,n;function s(o){const l=[];for(const c in o){const u=o[c];delete u.metadata,l.push(u)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const i=e.children[n];this.add(i.clone())}return this}}qe.DEFAULT_UP=new z(0,1,0),qe.DEFAULT_MATRIX_AUTO_UPDATE=!0,qe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const $t=new z,Mn=new z,qa=new z,Tn=new z,Ai=new z,Ei=new z,bo=new z,Ya=new z,Ka=new z,Za=new z;class on{constructor(e=new z,t=new z,n=new z){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),$t.subVectors(e,t),i.cross($t);const a=i.lengthSq();return a>0?i.multiplyScalar(1/Math.sqrt(a)):i.set(0,0,0)}static getBarycoord(e,t,n,i,a){$t.subVectors(i,t),Mn.subVectors(n,t),qa.subVectors(e,t);const s=$t.dot($t),o=$t.dot(Mn),l=$t.dot(qa),c=Mn.dot(Mn),u=Mn.dot(qa),h=s*c-o*o;if(h===0)return a.set(0,0,0),null;const d=1/h,p=(c*l-o*u)*d,v=(s*u-o*l)*d;return a.set(1-p-v,v,p)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,Tn)!==null&&Tn.x>=0&&Tn.y>=0&&Tn.x+Tn.y<=1}static getInterpolation(e,t,n,i,a,s,o,l){return this.getBarycoord(e,t,n,i,Tn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(a,Tn.x),l.addScaledVector(s,Tn.y),l.addScaledVector(o,Tn.z),l)}static isFrontFacing(e,t,n,i){return $t.subVectors(n,t),Mn.subVectors(e,t),$t.cross(Mn).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return $t.subVectors(this.c,this.b),Mn.subVectors(this.a,this.b),.5*$t.cross(Mn).length()}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return on.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return on.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,a){return on.getInterpolation(e,this.a,this.b,this.c,t,n,i,a)}containsPoint(e){return on.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return on.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,i=this.b,a=this.c;let s,o;Ai.subVectors(i,n),Ei.subVectors(a,n),Ya.subVectors(e,n);const l=Ai.dot(Ya),c=Ei.dot(Ya);if(l<=0&&c<=0)return t.copy(n);Ka.subVectors(e,i);const u=Ai.dot(Ka),h=Ei.dot(Ka);if(u>=0&&h<=u)return t.copy(i);const d=l*h-u*c;if(d<=0&&l>=0&&u<=0)return s=l/(l-u),t.copy(n).addScaledVector(Ai,s);Za.subVectors(e,a);const p=Ai.dot(Za),v=Ei.dot(Za);if(v>=0&&p<=v)return t.copy(a);const x=p*c-l*v;if(x<=0&&c>=0&&v<=0)return o=c/(c-v),t.copy(n).addScaledVector(Ei,o);const f=u*v-p*h;if(f<=0&&h-u>=0&&p-v>=0)return bo.subVectors(a,i),o=(h-u)/(h-u+(p-v)),t.copy(i).addScaledVector(bo,o);const _=1/(f+x+d);return s=x*_,o=d*_,t.copy(n).addScaledVector(Ai,s).addScaledVector(Ei,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}const So={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},In={h:0,s:0,l:0},qr={h:0,s:0,l:0};function Ja(r,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?r+6*(e-r)*t:t<.5?e:t<2/3?r+6*(e-r)*(2/3-t):r}class Se{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=_t){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(255&e)/255,Ve.toWorkingColorSpace(this,t),this}setRGB(e,t,n,i=Ve.workingColorSpace){return this.r=e,this.g=t,this.b=n,Ve.toWorkingColorSpace(this,i),this}setHSL(e,t,n,i=Ve.workingColorSpace){if(e=Na(e,1),t=bt(t,0,1),n=bt(n,0,1),t===0)this.r=this.g=this.b=n;else{const a=n<=.5?n*(1+t):n+t-n*t,s=2*n-a;this.r=Ja(s,a,e+1/3),this.g=Ja(s,a,e),this.b=Ja(s,a,e-1/3)}return Ve.toWorkingColorSpace(this,i),this}setStyle(e,t=_t){function n(a){a!==void 0&&parseFloat(a)}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let a;const s=i[1],o=i[2];switch(s){case"rgb":case"rgba":if(a=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(a[4]),this.setRGB(Math.min(255,parseInt(a[1],10))/255,Math.min(255,parseInt(a[2],10))/255,Math.min(255,parseInt(a[3],10))/255,t);if(a=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(a[4]),this.setRGB(Math.min(100,parseInt(a[1],10))/100,Math.min(100,parseInt(a[2],10))/100,Math.min(100,parseInt(a[3],10))/100,t);break;case"hsl":case"hsla":if(a=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(a[4]),this.setHSL(parseFloat(a[1])/360,parseFloat(a[2])/100,parseFloat(a[3])/100,t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){const a=i[1],s=a.length;if(s===3)return this.setRGB(parseInt(a.charAt(0),16)/15,parseInt(a.charAt(1),16)/15,parseInt(a.charAt(2),16)/15,t);if(s===6)return this.setHex(parseInt(a,16),t)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=_t){const n=So[e.toLowerCase()];return n!==void 0&&this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=xi(e.r),this.g=xi(e.g),this.b=xi(e.b),this}copyLinearToSRGB(e){return this.r=Ba(e.r),this.g=Ba(e.g),this.b=Ba(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=_t){return Ve.fromWorkingColorSpace(Mt.copy(this),e),65536*Math.round(bt(255*Mt.r,0,255))+256*Math.round(bt(255*Mt.g,0,255))+Math.round(bt(255*Mt.b,0,255))}getHexString(e=_t){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ve.workingColorSpace){Ve.fromWorkingColorSpace(Mt.copy(this),t);const n=Mt.r,i=Mt.g,a=Mt.b,s=Math.max(n,i,a),o=Math.min(n,i,a);let l,c;const u=(o+s)/2;if(o===s)l=0,c=0;else{const h=s-o;switch(c=u<=.5?h/(s+o):h/(2-s-o),s){case n:l=(i-a)/h+(i<a?6:0);break;case i:l=(a-n)/h+2;break;case a:l=(n-i)/h+4}l/=6}return e.h=l,e.s=c,e.l=u,e}getRGB(e,t=Ve.workingColorSpace){return Ve.fromWorkingColorSpace(Mt.copy(this),t),e.r=Mt.r,e.g=Mt.g,e.b=Mt.b,e}getStyle(e=_t){Ve.fromWorkingColorSpace(Mt.copy(this),e);const t=Mt.r,n=Mt.g,i=Mt.b;return e!==_t?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(255*t)},${Math.round(255*n)},${Math.round(255*i)})`}offsetHSL(e,t,n){return this.getHSL(In),this.setHSL(In.h+e,In.s+t,In.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(In),e.getHSL(qr);const n=nr(In.h,qr.h,t),i=nr(In.s,qr.s,t),a=nr(In.l,qr.l,t);return this.setHSL(n,i,a),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,i=this.b,a=e.elements;return this.r=a[0]*t+a[3]*n+a[6]*i,this.g=a[1]*t+a[4]*n+a[7]*i,this.b=a[2]*t+a[5]*n+a[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Mt=new Se;Se.NAMES=So;let fu=0;class ln extends jn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:fu++}),this.uuid=Yt(),this.name="",this.type="Material",this.blending=1,this.side=xn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=Gn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Se(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=mi,this.stencilZFail=mi,this.stencilZPass=mi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBuild(){}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0)continue;const i=this[t];i!==void 0&&(i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n)}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};function i(a){const s=[];for(const o in a){const l=a[o];delete l.metadata,s.push(l)}return s}if(n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==xn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==Gn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==mi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==mi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==mi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData),t){const a=i(e.textures),s=i(e.images);a.length>0&&(n.textures=a),s.length>0&&(n.images=s)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const i=t.length;n=new Array(i);for(let a=0;a!==i;++a)n[a]=t[a].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class Ot extends ln{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Se(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new sn,this.combine=$s,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const it=new z,Yr=new _e;class rt{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Ia,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.gpuType=It,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}get updateRange(){return Fa("THREE.BufferAttribute: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,a=this.itemSize;i<a;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Yr.fromBufferAttribute(this,t),Yr.applyMatrix3(e),this.setXY(t,Yr.x,Yr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)it.fromBufferAttribute(this,t),it.applyMatrix3(e),this.setXYZ(t,it.x,it.y,it.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)it.fromBufferAttribute(this,t),it.applyMatrix4(e),this.setXYZ(t,it.x,it.y,it.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)it.fromBufferAttribute(this,t),it.applyNormalMatrix(e),this.setXYZ(t,it.x,it.y,it.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)it.fromBufferAttribute(this,t),it.transformDirection(e),this.setXYZ(t,it.x,it.y,it.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Kt(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=He(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Kt(t,this.array)),t}setX(e,t){return this.normalized&&(t=He(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Kt(t,this.array)),t}setY(e,t){return this.normalized&&(t=He(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Kt(t,this.array)),t}setZ(e,t){return this.normalized&&(t=He(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Kt(t,this.array)),t}setW(e,t){return this.normalized&&(t=He(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=He(t,this.array),n=He(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=He(t,this.array),n=He(n,this.array),i=He(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,a){return e*=this.itemSize,this.normalized&&(t=He(t,this.array),n=He(n,this.array),i=He(i,this.array),a=He(a,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=a,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Ia&&(e.usage=this.usage),e}}class Mo extends rt{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class To extends rt{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class en extends rt{constructor(e,t,n){super(new Float32Array(e),t,n)}}let mu=0;const Vt=new Pe,Qa=new qe,Ri=new z,Ft=new _n,lr=new _n,vt=new z;class Bt extends jn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:mu++}),this.uuid=Yt(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(ao(e)?To:Mo)(e,1):this.index=e,this}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const a=new Le().getNormalMatrix(e);n.applyNormalMatrix(a),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Vt.makeRotationFromQuaternion(e),this.applyMatrix4(Vt),this}rotateX(e){return Vt.makeRotationX(e),this.applyMatrix4(Vt),this}rotateY(e){return Vt.makeRotationY(e),this.applyMatrix4(Vt),this}rotateZ(e){return Vt.makeRotationZ(e),this.applyMatrix4(Vt),this}translate(e,t,n){return Vt.makeTranslation(e,t,n),this.applyMatrix4(Vt),this}scale(e,t,n){return Vt.makeScale(e,t,n),this.applyMatrix4(Vt),this}lookAt(e){return Qa.lookAt(e),Qa.updateMatrix(),this.applyMatrix4(Qa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Ri).negate(),this.translate(Ri.x,Ri.y,Ri.z),this}setFromPoints(e){const t=[];for(let n=0,i=e.length;n<i;n++){const a=e[n];t.push(a.x,a.y,a.z||0)}return this.setAttribute("position",new en(t,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new _n);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)this.boundingBox.set(new z(-1/0,-1/0,-1/0),new z(1/0,1/0,1/0));else{if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){const a=t[n];Ft.setFromBufferAttribute(a),this.morphTargetsRelative?(vt.addVectors(this.boundingBox.min,Ft.min),this.boundingBox.expandByPoint(vt),vt.addVectors(this.boundingBox.max,Ft.max),this.boundingBox.expandByPoint(vt)):(this.boundingBox.expandByPoint(Ft.min),this.boundingBox.expandByPoint(Ft.max))}}else this.boundingBox.makeEmpty();isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z)}}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new an);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)this.boundingSphere.set(new z,1/0);else if(e){const n=this.boundingSphere.center;if(Ft.setFromBufferAttribute(e),t)for(let a=0,s=t.length;a<s;a++){const o=t[a];lr.setFromBufferAttribute(o),this.morphTargetsRelative?(vt.addVectors(Ft.min,lr.min),Ft.expandByPoint(vt),vt.addVectors(Ft.max,lr.max),Ft.expandByPoint(vt)):(Ft.expandByPoint(lr.min),Ft.expandByPoint(lr.max))}Ft.getCenter(n);let i=0;for(let a=0,s=e.count;a<s;a++)vt.fromBufferAttribute(e,a),i=Math.max(i,n.distanceToSquared(vt));if(t)for(let a=0,s=t.length;a<s;a++){const o=t[a],l=this.morphTargetsRelative;for(let c=0,u=o.count;c<u;c++)vt.fromBufferAttribute(o,c),l&&(Ri.fromBufferAttribute(e,c),vt.add(Ri)),i=Math.max(i,n.distanceToSquared(vt))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0)return;const n=t.position,i=t.normal,a=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new rt(new Float32Array(4*n.count),4));const s=this.getAttribute("tangent"),o=[],l=[];for(let X=0;X<n.count;X++)o[X]=new z,l[X]=new z;const c=new z,u=new z,h=new z,d=new _e,p=new _e,v=new _e,x=new z,f=new z;function _(X,j,K){c.fromBufferAttribute(n,X),u.fromBufferAttribute(n,j),h.fromBufferAttribute(n,K),d.fromBufferAttribute(a,X),p.fromBufferAttribute(a,j),v.fromBufferAttribute(a,K),u.sub(c),h.sub(c),p.sub(d),v.sub(d);const ae=1/(p.x*v.y-v.x*p.y);isFinite(ae)&&(x.copy(u).multiplyScalar(v.y).addScaledVector(h,-p.y).multiplyScalar(ae),f.copy(h).multiplyScalar(p.x).addScaledVector(u,-v.x).multiplyScalar(ae),o[X].add(x),o[j].add(x),o[K].add(x),l[X].add(f),l[j].add(f),l[K].add(f))}let m=this.groups;m.length===0&&(m=[{start:0,count:e.count}]);for(let X=0,j=m.length;X<j;++X){const K=m[X],ae=K.start;for(let $=ae,se=ae+K.count;$<se;$+=3)_(e.getX($+0),e.getX($+1),e.getX($+2))}const b=new z,P=new z,Y=new z,D=new z;function G(X){Y.fromBufferAttribute(i,X),D.copy(Y);const j=o[X];b.copy(j),b.sub(Y.multiplyScalar(Y.dot(j))).normalize(),P.crossVectors(D,j);const K=P.dot(l[X])<0?-1:1;s.setXYZW(X,b.x,b.y,b.z,K)}for(let X=0,j=m.length;X<j;++X){const K=m[X],ae=K.start;for(let $=ae,se=ae+K.count;$<se;$+=3)G(e.getX($+0)),G(e.getX($+1)),G(e.getX($+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new rt(new Float32Array(3*t.count),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);const i=new z,a=new z,s=new z,o=new z,l=new z,c=new z,u=new z,h=new z;if(e)for(let d=0,p=e.count;d<p;d+=3){const v=e.getX(d+0),x=e.getX(d+1),f=e.getX(d+2);i.fromBufferAttribute(t,v),a.fromBufferAttribute(t,x),s.fromBufferAttribute(t,f),u.subVectors(s,a),h.subVectors(i,a),u.cross(h),o.fromBufferAttribute(n,v),l.fromBufferAttribute(n,x),c.fromBufferAttribute(n,f),o.add(u),l.add(u),c.add(u),n.setXYZ(v,o.x,o.y,o.z),n.setXYZ(x,l.x,l.y,l.z),n.setXYZ(f,c.x,c.y,c.z)}else for(let d=0,p=t.count;d<p;d+=3)i.fromBufferAttribute(t,d+0),a.fromBufferAttribute(t,d+1),s.fromBufferAttribute(t,d+2),u.subVectors(s,a),h.subVectors(i,a),u.cross(h),n.setXYZ(d+0,u.x,u.y,u.z),n.setXYZ(d+1,u.x,u.y,u.z),n.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)vt.fromBufferAttribute(e,t),vt.normalize(),e.setXYZ(t,vt.x,vt.y,vt.z)}toNonIndexed(){function e(o,l){const c=o.array,u=o.itemSize,h=o.normalized,d=new c.constructor(l.length*u);let p=0,v=0;for(let x=0,f=l.length;x<f;x++){p=o.isInterleavedBufferAttribute?l[x]*o.data.stride+o.offset:l[x]*u;for(let _=0;_<u;_++)d[v++]=c[p++]}return new rt(d,u,h)}if(this.index===null)return this;const t=new Bt,n=this.index.array,i=this.attributes;for(const o in i){const l=e(i[o],n);t.setAttribute(o,l)}const a=this.morphAttributes;for(const o in a){const l=[],c=a[o];for(let u=0,h=c.length;u<h;u++){const d=e(c[u],n);l.push(d)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const s=this.groups;for(let o=0,l=s.length;o<l;o++){const c=s[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const i={};let a=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],u=[];for(let h=0,d=c.length;h<d;h++){const p=c[h];u.push(p.toJSON(e.data))}u.length>0&&(i[l]=u,a=!0)}a&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);const s=this.groups;s.length>0&&(e.data.groups=JSON.parse(JSON.stringify(s)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone(t));const i=e.attributes;for(const c in i){const u=i[c];this.setAttribute(c,u.clone(t))}const a=e.morphAttributes;for(const c in a){const u=[],h=a[c];for(let d=0,p=h.length;d<p;d++)u.push(h[d].clone(t));this.morphAttributes[c]=u}this.morphTargetsRelative=e.morphTargetsRelative;const s=e.groups;for(let c=0,u=s.length;c<u;c++){const h=s[c];this.addGroup(h.start,h.count,h.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const wo=new Pe,Yn=new sr,Kr=new an,Ao=new z,Ci=new z,Pi=new z,Li=new z,$a=new z,Zr=new z,Jr=new _e,Qr=new _e,$r=new _e,Eo=new z,Ro=new z,Co=new z,ea=new z,ta=new z;class at extends qe{constructor(e=new Bt,t=new Ot){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){const n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,a=n.length;i<a;i++){const s=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[s]=i}}}}getVertexPosition(e,t){const n=this.geometry,i=n.attributes.position,a=n.morphAttributes.position,s=n.morphTargetsRelative;t.fromBufferAttribute(i,e);const o=this.morphTargetInfluences;if(a&&o){Zr.set(0,0,0);for(let l=0,c=a.length;l<c;l++){const u=o[l],h=a[l];u!==0&&($a.fromBufferAttribute(h,e),s?Zr.addScaledVector($a,u):Zr.addScaledVector($a.sub(t),u))}t.add(Zr)}return t}raycast(e,t){const n=this.geometry,i=this.material,a=this.matrixWorld;if(i!==void 0){if(n.boundingSphere===null&&n.computeBoundingSphere(),Kr.copy(n.boundingSphere),Kr.applyMatrix4(a),Yn.copy(e.ray).recast(e.near),Kr.containsPoint(Yn.origin)===!1&&(Yn.intersectSphere(Kr,Ao)===null||Yn.origin.distanceToSquared(Ao)>(e.far-e.near)**2))return;wo.copy(a).invert(),Yn.copy(e.ray).applyMatrix4(wo),n.boundingBox!==null&&Yn.intersectsBox(n.boundingBox)===!1||this._computeIntersections(e,t,Yn)}}_computeIntersections(e,t,n){let i;const a=this.geometry,s=this.material,o=a.index,l=a.attributes.position,c=a.attributes.uv,u=a.attributes.uv1,h=a.attributes.normal,d=a.groups,p=a.drawRange;if(o!==null)if(Array.isArray(s))for(let v=0,x=d.length;v<x;v++){const f=d[v],_=s[f.materialIndex];for(let m=Math.max(f.start,p.start),b=Math.min(o.count,Math.min(f.start+f.count,p.start+p.count));m<b;m+=3)i=na(this,_,e,n,c,u,h,o.getX(m),o.getX(m+1),o.getX(m+2)),i&&(i.faceIndex=Math.floor(m/3),i.face.materialIndex=f.materialIndex,t.push(i))}else for(let v=Math.max(0,p.start),x=Math.min(o.count,p.start+p.count);v<x;v+=3)i=na(this,s,e,n,c,u,h,o.getX(v),o.getX(v+1),o.getX(v+2)),i&&(i.faceIndex=Math.floor(v/3),t.push(i));else if(l!==void 0)if(Array.isArray(s))for(let v=0,x=d.length;v<x;v++){const f=d[v],_=s[f.materialIndex];for(let m=Math.max(f.start,p.start),b=Math.min(l.count,Math.min(f.start+f.count,p.start+p.count));m<b;m+=3)i=na(this,_,e,n,c,u,h,m,m+1,m+2),i&&(i.faceIndex=Math.floor(m/3),i.face.materialIndex=f.materialIndex,t.push(i))}else for(let v=Math.max(0,p.start),x=Math.min(l.count,p.start+p.count);v<x;v+=3)i=na(this,s,e,n,c,u,h,v,v+1,v+2),i&&(i.faceIndex=Math.floor(v/3),t.push(i))}}function na(r,e,t,n,i,a,s,o,l,c){r.getVertexPosition(o,Ci),r.getVertexPosition(l,Pi),r.getVertexPosition(c,Li);const u=function(h,d,p,v,x,f,_,m){let b;if(b=d.side===Lt?v.intersectTriangle(_,f,x,!0,m):v.intersectTriangle(x,f,_,d.side===xn,m),b===null)return null;ta.copy(m),ta.applyMatrix4(h.matrixWorld);const P=p.ray.origin.distanceTo(ta);return P<p.near||P>p.far?null:{distance:P,point:ta.clone(),object:h}}(r,e,t,n,Ci,Pi,Li,ea);if(u){i&&(Jr.fromBufferAttribute(i,o),Qr.fromBufferAttribute(i,l),$r.fromBufferAttribute(i,c),u.uv=on.getInterpolation(ea,Ci,Pi,Li,Jr,Qr,$r,new _e)),a&&(Jr.fromBufferAttribute(a,o),Qr.fromBufferAttribute(a,l),$r.fromBufferAttribute(a,c),u.uv1=on.getInterpolation(ea,Ci,Pi,Li,Jr,Qr,$r,new _e)),s&&(Eo.fromBufferAttribute(s,o),Ro.fromBufferAttribute(s,l),Co.fromBufferAttribute(s,c),u.normal=on.getInterpolation(ea,Ci,Pi,Li,Eo,Ro,Co,new z),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const h={a:o,b:l,c,normal:new z,materialIndex:0};on.getNormal(Ci,Pi,Li,h.normal),u.face=h}return u}class cr extends Bt{constructor(e=1,t=1,n=1,i=1,a=1,s=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:a,depthSegments:s};const o=this;i=Math.floor(i),a=Math.floor(a),s=Math.floor(s);const l=[],c=[],u=[],h=[];let d=0,p=0;function v(x,f,_,m,b,P,Y,D,G,X,j){const K=P/G,ae=Y/X,$=P/2,se=Y/2,J=D/2,ce=G+1,re=X+1;let de=0,E=0;const g=new z;for(let T=0;T<re;T++){const U=T*ae-se;for(let C=0;C<ce;C++){const W=C*K-$;g[x]=W*m,g[f]=U*b,g[_]=J,c.push(g.x,g.y,g.z),g[x]=0,g[f]=0,g[_]=D>0?1:-1,u.push(g.x,g.y,g.z),h.push(C/G),h.push(1-T/X),de+=1}}for(let T=0;T<X;T++)for(let U=0;U<G;U++){const C=d+U+ce*T,W=d+U+ce*(T+1),k=d+(U+1)+ce*(T+1),M=d+(U+1)+ce*T;l.push(C,W,M),l.push(W,k,M),E+=6}o.addGroup(p,E,j),p+=E,d+=de}v("z","y","x",-1,-1,n,t,e,s,a,0),v("z","y","x",1,-1,n,t,-e,s,a,1),v("x","z","y",1,1,e,n,t,i,s,2),v("x","z","y",1,-1,e,n,-t,i,s,3),v("x","y","z",1,-1,e,t,n,i,a,4),v("x","y","z",-1,-1,e,t,-n,i,a,5),this.setIndex(l),this.setAttribute("position",new en(c,3)),this.setAttribute("normal",new en(u,3)),this.setAttribute("uv",new en(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new cr(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}function Di(r){const e={};for(const t in r){e[t]={};for(const n in r[t]){const i=r[t][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?e[t][n]=null:e[t][n]=i.clone():Array.isArray(i)?e[t][n]=i.slice():e[t][n]=i}}return e}function wt(r){const e={};for(let t=0;t<r.length;t++){const n=Di(r[t]);for(const i in n)e[i]=n[i]}return e}function Po(r){const e=r.getRenderTarget();return e===null?r.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Ve.workingColorSpace}const Kn={clone:Di,merge:wt};class ht extends ln{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,this.fragmentShader=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Di(e.uniforms),this.uniformsGroups=function(t){const n=[];for(let i=0;i<t.length;i++)n.push(t[i].clone());return n}(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const i in this.uniforms){const a=this.uniforms[i].value;a&&a.isTexture?t.uniforms[i]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[i]={type:"m4",value:a.toArray()}:t.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}}class es extends qe{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Pe,this.projectionMatrix=new Pe,this.projectionMatrixInverse=new Pe,this.coordinateSystem=gi}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const Nn=new z,Lo=new _e,Do=new _e;class At extends es{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=2*vi*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(.5*tr*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return 2*vi*Math.atan(Math.tan(.5*tr*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Nn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Nn.x,Nn.y).multiplyScalar(-e/Nn.z),Nn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Nn.x,Nn.y).multiplyScalar(-e/Nn.z)}getViewSize(e,t){return this.getViewBounds(e,Lo,Do),t.subVectors(Do,Lo)}setViewOffset(e,t,n,i,a,s){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=a,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(.5*tr*this.fov)/this.zoom,n=2*t,i=this.aspect*n,a=-.5*i;const s=this.view;if(this.view!==null&&this.view.enabled){const l=s.fullWidth,c=s.fullHeight;a+=s.offsetX*i/l,t-=s.offsetY*n/c,i*=s.width/l,n*=s.height/c}const o=this.filmOffset;o!==0&&(a+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(a,a+i,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}const Ui=-90;class gu extends qe{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new At(Ui,1,e,t);i.layers=this.layers,this.add(i);const a=new At(Ui,1,e,t);a.layers=this.layers,this.add(a);const s=new At(Ui,1,e,t);s.layers=this.layers,this.add(s);const o=new At(Ui,1,e,t);o.layers=this.layers,this.add(o);const l=new At(Ui,1,e,t);l.layers=this.layers,this.add(l);const c=new At(Ui,1,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,i,a,s,o,l]=t;for(const c of t)this.remove(c);if(e===gi)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),a.up.set(0,0,-1),a.lookAt(0,1,0),s.up.set(0,0,1),s.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else{if(e!==Br)throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),a.up.set(0,0,1),a.lookAt(0,1,0),s.up.set(0,0,-1),s.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1)}for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[a,s,o,l,c,u]=this.children,h=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),v=e.xr.enabled;e.xr.enabled=!1;const x=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,i),e.render(t,a),e.setRenderTarget(n,1,i),e.render(t,s),e.setRenderTarget(n,2,i),e.render(t,o),e.setRenderTarget(n,3,i),e.render(t,l),e.setRenderTarget(n,4,i),e.render(t,c),n.texture.generateMipmaps=x,e.setRenderTarget(n,5,i),e.render(t,u),e.setRenderTarget(h,d,p),e.xr.enabled=v,n.texture.needsPMREMUpdate=!0}}class Uo extends nt{constructor(e,t,n,i,a,s,o,l,c,u){super(e=e!==void 0?e:[],t=t!==void 0?t:oi,n,i,a,s,o,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class vu extends Tt{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new Uo(i,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0&&t.generateMipmaps,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:Ut}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new cr(5,5,5),a=new ht({name:"CubemapFromEquirect",uniforms:Di(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Lt,blending:0});a.uniforms.tEquirect.value=t;const s=new at(i,a),o=t.minFilter;return t.minFilter===Wn&&(t.minFilter=Ut),new gu(1,10,this).update(e,s),t.minFilter=o,s.geometry.dispose(),s.material.dispose(),this}clear(e,t,n,i){const a=e.getRenderTarget();for(let s=0;s<6;s++)e.setRenderTarget(this,s),e.clear(t,n,i);e.setRenderTarget(a)}}const ts=new z,xu=new z,_u=new Le;class On{constructor(e=new z(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const i=ts.subVectors(n,t).cross(xu.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const n=e.delta(ts),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const a=-(e.start.dot(this.normal)+this.constant)/i;return a<0||a>1?null:t.copy(e.start).addScaledVector(n,a)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||_u.getNormalMatrix(e),i=this.coplanarPoint(ts).applyMatrix4(e),a=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(a),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Zn=new an,ia=new z;class ns{constructor(e=new On,t=new On,n=new On,i=new On,a=new On,s=new On){this.planes=[e,t,n,i,a,s]}set(e,t,n,i,a,s){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(a),o[5].copy(s),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=2e3){const n=this.planes,i=e.elements,a=i[0],s=i[1],o=i[2],l=i[3],c=i[4],u=i[5],h=i[6],d=i[7],p=i[8],v=i[9],x=i[10],f=i[11],_=i[12],m=i[13],b=i[14],P=i[15];if(n[0].setComponents(l-a,d-c,f-p,P-_).normalize(),n[1].setComponents(l+a,d+c,f+p,P+_).normalize(),n[2].setComponents(l+s,d+u,f+v,P+m).normalize(),n[3].setComponents(l-s,d-u,f-v,P-m).normalize(),n[4].setComponents(l-o,d-h,f-x,P-b).normalize(),t===gi)n[5].setComponents(l+o,d+h,f+x,P+b).normalize();else{if(t!==Br)throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);n[5].setComponents(o,h,x,b).normalize()}return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Zn.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Zn.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Zn)}intersectsSprite(e){return Zn.center.set(0,0,0),Zn.radius=.7071067811865476,Zn.applyMatrix4(e.matrixWorld),this.intersectsSphere(Zn)}intersectsSphere(e){const t=this.planes,n=e.center,i=-e.radius;for(let a=0;a<6;a++)if(t[a].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const i=t[n];if(ia.x=i.normal.x>0?e.max.x:e.min.x,ia.y=i.normal.y>0?e.max.y:e.min.y,ia.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(ia)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}function Io(){let r=null,e=!1,t=null,n=null;function i(a,s){t(a,s),n=r.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&(n=r.requestAnimationFrame(i),e=!0)},stop:function(){r.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(a){t=a},setContext:function(a){r=a}}}function yu(r){const e=new WeakMap;return{get:function(t){return t.isInterleavedBufferAttribute&&(t=t.data),e.get(t)},remove:function(t){t.isInterleavedBufferAttribute&&(t=t.data);const n=e.get(t);n&&(r.deleteBuffer(n.buffer),e.delete(t))},update:function(t,n){if(t.isGLBufferAttribute){const a=e.get(t);return void((!a||a.version<t.version)&&e.set(t,{buffer:t.buffer,type:t.type,bytesPerElement:t.elementSize,version:t.version}))}t.isInterleavedBufferAttribute&&(t=t.data);const i=e.get(t);if(i===void 0)e.set(t,function(a,s){const o=a.array,l=a.usage,c=o.byteLength,u=r.createBuffer();let h;if(r.bindBuffer(s,u),r.bufferData(s,o,l),a.onUploadCallback(),o instanceof Float32Array)h=r.FLOAT;else if(o instanceof Uint16Array)h=a.isFloat16BufferAttribute?r.HALF_FLOAT:r.UNSIGNED_SHORT;else if(o instanceof Int16Array)h=r.SHORT;else if(o instanceof Uint32Array)h=r.UNSIGNED_INT;else if(o instanceof Int32Array)h=r.INT;else if(o instanceof Int8Array)h=r.BYTE;else if(o instanceof Uint8Array)h=r.UNSIGNED_BYTE;else{if(!(o instanceof Uint8ClampedArray))throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+o);h=r.UNSIGNED_BYTE}return{buffer:u,type:h,bytesPerElement:o.BYTES_PER_ELEMENT,version:a.version,size:c}}(t,n));else if(i.version<t.version){if(i.size!==t.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");(function(a,s,o){const l=s.array,c=s._updateRange,u=s.updateRanges;if(r.bindBuffer(o,a),c.count===-1&&u.length===0&&r.bufferSubData(o,0,l),u.length!==0){for(let h=0,d=u.length;h<d;h++){const p=u[h];r.bufferSubData(o,p.start*l.BYTES_PER_ELEMENT,l,p.start,p.count)}s.clearUpdateRanges()}c.count!==-1&&(r.bufferSubData(o,c.offset*l.BYTES_PER_ELEMENT,l,c.offset,c.count),c.count=-1),s.onUploadCallback()})(i.buffer,t,n),i.version=t.version}}}}class cn extends Bt{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};const a=e/2,s=t/2,o=Math.floor(n),l=Math.floor(i),c=o+1,u=l+1,h=e/o,d=t/l,p=[],v=[],x=[],f=[];for(let _=0;_<u;_++){const m=_*d-s;for(let b=0;b<c;b++){const P=b*h-a;v.push(P,-m,0),x.push(0,0,1),f.push(b/o),f.push(1-_/l)}}for(let _=0;_<l;_++)for(let m=0;m<o;m++){const b=m+c*_,P=m+c*(_+1),Y=m+1+c*(_+1),D=m+1+c*_;p.push(b,P,D),p.push(P,Y,D)}this.setIndex(p),this.setAttribute("position",new en(v,3)),this.setAttribute("normal",new en(x,3)),this.setAttribute("uv",new en(f,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new cn(e.width,e.height,e.widthSegments,e.heightSegments)}}const De={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	attribute float batchId;
	uniform highp sampler2D batchingTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( batchId );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( batchId );
	vColor.xyz *= batchingColor.xyz;
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
float luminance( const in vec3 rgb ) {
	const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 );
	return dot( weights, rgb );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:"gl_FragColor = linearToOutputTexel( gl_FragColor );",colorspace_pars_fragment:`
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(
	vec3( 0.8224621, 0.177538, 0.0 ),
	vec3( 0.0331941, 0.9668058, 0.0 ),
	vec3( 0.0170827, 0.0723974, 0.9105199 )
);
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(
	vec3( 1.2249401, - 0.2249404, 0.0 ),
	vec3( - 0.0420569, 1.0420571, 0.0 ),
	vec3( - 0.0196376, - 0.0786361, 1.0982735 )
);
vec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {
	return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );
}
vec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {
	return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );
}
vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 LinearToLinear( in vec4 value ) {
	return value;
}
vec4 LinearTosRGB( in vec4 value ) {
	return sRGBTransferOETF( value );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256., 256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );
const float ShiftRight8 = 1. / 256.;
vec4 packDepthToRGBA( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8;	return r * PackUpscale;
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors );
}
vec2 packDepthToRG( in highp float v ) {
	return packDepthToRGBA( v ).yx;
}
float unpackRGToDepth( const in highp vec2 v ) {
	return unpackRGBAToDepth( vec4( v.xy, 0.0, 0.0 ) );
}
vec4 pack2HalfToRGBA( vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return shadow;
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return shadow;
	}
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 OptimizedCineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#endif
}`,distanceRGBA_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distanceRGBA_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},pe={common:{diffuse:{value:new Se(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Le},alphaMap:{value:null},alphaMapTransform:{value:new Le},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Le}},envmap:{envMap:{value:null},envMapRotation:{value:new Le},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Le}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Le}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Le},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Le},normalScale:{value:new _e(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Le},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Le}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Le}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Le}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Se(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Se(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Le},alphaTest:{value:0},uvTransform:{value:new Le}},sprite:{diffuse:{value:new Se(16777215)},opacity:{value:1},center:{value:new _e(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Le},alphaMap:{value:null},alphaMapTransform:{value:new Le},alphaTest:{value:0}}},un={basic:{uniforms:wt([pe.common,pe.specularmap,pe.envmap,pe.aomap,pe.lightmap,pe.fog]),vertexShader:De.meshbasic_vert,fragmentShader:De.meshbasic_frag},lambert:{uniforms:wt([pe.common,pe.specularmap,pe.envmap,pe.aomap,pe.lightmap,pe.emissivemap,pe.bumpmap,pe.normalmap,pe.displacementmap,pe.fog,pe.lights,{emissive:{value:new Se(0)}}]),vertexShader:De.meshlambert_vert,fragmentShader:De.meshlambert_frag},phong:{uniforms:wt([pe.common,pe.specularmap,pe.envmap,pe.aomap,pe.lightmap,pe.emissivemap,pe.bumpmap,pe.normalmap,pe.displacementmap,pe.fog,pe.lights,{emissive:{value:new Se(0)},specular:{value:new Se(1118481)},shininess:{value:30}}]),vertexShader:De.meshphong_vert,fragmentShader:De.meshphong_frag},standard:{uniforms:wt([pe.common,pe.envmap,pe.aomap,pe.lightmap,pe.emissivemap,pe.bumpmap,pe.normalmap,pe.displacementmap,pe.roughnessmap,pe.metalnessmap,pe.fog,pe.lights,{emissive:{value:new Se(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:De.meshphysical_vert,fragmentShader:De.meshphysical_frag},toon:{uniforms:wt([pe.common,pe.aomap,pe.lightmap,pe.emissivemap,pe.bumpmap,pe.normalmap,pe.displacementmap,pe.gradientmap,pe.fog,pe.lights,{emissive:{value:new Se(0)}}]),vertexShader:De.meshtoon_vert,fragmentShader:De.meshtoon_frag},matcap:{uniforms:wt([pe.common,pe.bumpmap,pe.normalmap,pe.displacementmap,pe.fog,{matcap:{value:null}}]),vertexShader:De.meshmatcap_vert,fragmentShader:De.meshmatcap_frag},points:{uniforms:wt([pe.points,pe.fog]),vertexShader:De.points_vert,fragmentShader:De.points_frag},dashed:{uniforms:wt([pe.common,pe.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:De.linedashed_vert,fragmentShader:De.linedashed_frag},depth:{uniforms:wt([pe.common,pe.displacementmap]),vertexShader:De.depth_vert,fragmentShader:De.depth_frag},normal:{uniforms:wt([pe.common,pe.bumpmap,pe.normalmap,pe.displacementmap,{opacity:{value:1}}]),vertexShader:De.meshnormal_vert,fragmentShader:De.meshnormal_frag},sprite:{uniforms:wt([pe.sprite,pe.fog]),vertexShader:De.sprite_vert,fragmentShader:De.sprite_frag},background:{uniforms:{uvTransform:{value:new Le},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:De.background_vert,fragmentShader:De.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Le}},vertexShader:De.backgroundCube_vert,fragmentShader:De.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:De.cube_vert,fragmentShader:De.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:De.equirect_vert,fragmentShader:De.equirect_frag},distanceRGBA:{uniforms:wt([pe.common,pe.displacementmap,{referencePosition:{value:new z},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:De.distanceRGBA_vert,fragmentShader:De.distanceRGBA_frag},shadow:{uniforms:wt([pe.lights,pe.fog,{color:{value:new Se(0)},opacity:{value:1}}]),vertexShader:De.shadow_vert,fragmentShader:De.shadow_frag}};un.physical={uniforms:wt([un.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Le},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Le},clearcoatNormalScale:{value:new _e(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Le},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Le},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Le},sheen:{value:0},sheenColor:{value:new Se(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Le},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Le},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Le},transmissionSamplerSize:{value:new _e},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Le},attenuationDistance:{value:0},attenuationColor:{value:new Se(0)},specularColor:{value:new Se(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Le},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Le},anisotropyVector:{value:new _e},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Le}}]),vertexShader:De.meshphysical_vert,fragmentShader:De.meshphysical_frag};const ra={r:0,b:0,g:0},Jn=new sn,bu=new Pe;function Su(r,e,t,n,i,a,s){const o=new Se(0);let l,c,u=a===!0?0:1,h=null,d=0,p=null;function v(f){let _=f.isScene===!0?f.background:null;return _&&_.isTexture&&(_=(f.backgroundBlurriness>0?t:e).get(_)),_}function x(f,_){f.getRGB(ra,Po(r)),n.buffers.color.setClear(ra.r,ra.g,ra.b,_,s)}return{getClearColor:function(){return o},setClearColor:function(f,_=1){o.set(f),u=_,x(o,u)},getClearAlpha:function(){return u},setClearAlpha:function(f){u=f,x(o,u)},render:function(f){let _=!1;const m=v(f);m===null?x(o,u):m&&m.isColor&&(x(m,1),_=!0);const b=r.xr.getEnvironmentBlendMode();b==="additive"?n.buffers.color.setClear(0,0,0,1,s):b==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,s),(r.autoClear||_)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),r.clear(r.autoClearColor,r.autoClearDepth,r.autoClearStencil))},addToRenderList:function(f,_){const m=v(_);m&&(m.isCubeTexture||m.mapping===Cr)?(c===void 0&&(c=new at(new cr(1,1,1),new ht({name:"BackgroundCubeMaterial",uniforms:Di(un.backgroundCube.uniforms),vertexShader:un.backgroundCube.vertexShader,fragmentShader:un.backgroundCube.fragmentShader,side:Lt,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(b,P,Y){this.matrixWorld.copyPosition(Y.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(c)),Jn.copy(_.backgroundRotation),Jn.x*=-1,Jn.y*=-1,Jn.z*=-1,m.isCubeTexture&&m.isRenderTargetTexture===!1&&(Jn.y*=-1,Jn.z*=-1),c.material.uniforms.envMap.value=m,c.material.uniforms.flipEnvMap.value=m.isCubeTexture&&m.isRenderTargetTexture===!1?-1:1,c.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(bu.makeRotationFromEuler(Jn)),c.material.toneMapped=Ve.getTransfer(m.colorSpace)!==Ze,h===m&&d===m.version&&p===r.toneMapping||(c.material.needsUpdate=!0,h=m,d=m.version,p=r.toneMapping),c.layers.enableAll(),f.unshift(c,c.geometry,c.material,0,0,null)):m&&m.isTexture&&(l===void 0&&(l=new at(new cn(2,2),new ht({name:"BackgroundMaterial",uniforms:Di(un.background.uniforms),vertexShader:un.background.vertexShader,fragmentShader:un.background.fragmentShader,side:xn,depthTest:!1,depthWrite:!1,fog:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=m,l.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,l.material.toneMapped=Ve.getTransfer(m.colorSpace)!==Ze,m.matrixAutoUpdate===!0&&m.updateMatrix(),l.material.uniforms.uvTransform.value.copy(m.matrix),h===m&&d===m.version&&p===r.toneMapping||(l.material.needsUpdate=!0,h=m,d=m.version,p=r.toneMapping),l.layers.enableAll(),f.unshift(l,l.geometry,l.material,0,0,null))}}}function Mu(r,e){const t=r.getParameter(r.MAX_VERTEX_ATTRIBS),n={},i=c(null);let a=i,s=!1;function o(_){return r.bindVertexArray(_)}function l(_){return r.deleteVertexArray(_)}function c(_){const m=[],b=[],P=[];for(let Y=0;Y<t;Y++)m[Y]=0,b[Y]=0,P[Y]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:m,enabledAttributes:b,attributeDivisors:P,object:_,attributes:{},index:null}}function u(){const _=a.newAttributes;for(let m=0,b=_.length;m<b;m++)_[m]=0}function h(_){d(_,0)}function d(_,m){const b=a.newAttributes,P=a.enabledAttributes,Y=a.attributeDivisors;b[_]=1,P[_]===0&&(r.enableVertexAttribArray(_),P[_]=1),Y[_]!==m&&(r.vertexAttribDivisor(_,m),Y[_]=m)}function p(){const _=a.newAttributes,m=a.enabledAttributes;for(let b=0,P=m.length;b<P;b++)m[b]!==_[b]&&(r.disableVertexAttribArray(b),m[b]=0)}function v(_,m,b,P,Y,D,G){G===!0?r.vertexAttribIPointer(_,m,b,Y,D):r.vertexAttribPointer(_,m,b,P,Y,D)}function x(){f(),s=!0,a!==i&&(a=i,o(a.object))}function f(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:function(_,m,b,P,Y){let D=!1;const G=function(X,j,K){const ae=K.wireframe===!0;let $=n[X.id];$===void 0&&($={},n[X.id]=$);let se=$[j.id];se===void 0&&(se={},$[j.id]=se);let J=se[ae];return J===void 0&&(J=c(r.createVertexArray()),se[ae]=J),J}(P,b,m);a!==G&&(a=G,o(a.object)),D=function(X,j,K,ae){const $=a.attributes,se=j.attributes;let J=0;const ce=K.getAttributes();for(const re in ce)if(ce[re].location>=0){const de=$[re];let E=se[re];if(E===void 0&&(re==="instanceMatrix"&&X.instanceMatrix&&(E=X.instanceMatrix),re==="instanceColor"&&X.instanceColor&&(E=X.instanceColor)),de===void 0||de.attribute!==E||E&&de.data!==E.data)return!0;J++}return a.attributesNum!==J||a.index!==ae}(_,P,b,Y),D&&function(X,j,K,ae){const $={},se=j.attributes;let J=0;const ce=K.getAttributes();for(const re in ce)if(ce[re].location>=0){let de=se[re];de===void 0&&(re==="instanceMatrix"&&X.instanceMatrix&&(de=X.instanceMatrix),re==="instanceColor"&&X.instanceColor&&(de=X.instanceColor));const E={};E.attribute=de,de&&de.data&&(E.data=de.data),$[re]=E,J++}a.attributes=$,a.attributesNum=J,a.index=ae}(_,P,b,Y),Y!==null&&e.update(Y,r.ELEMENT_ARRAY_BUFFER),(D||s)&&(s=!1,function(X,j,K,ae){u();const $=ae.attributes,se=K.getAttributes(),J=j.defaultAttributeValues;for(const ce in se){const re=se[ce];if(re.location>=0){let de=$[ce];if(de===void 0&&(ce==="instanceMatrix"&&X.instanceMatrix&&(de=X.instanceMatrix),ce==="instanceColor"&&X.instanceColor&&(de=X.instanceColor)),de!==void 0){const E=de.normalized,g=de.itemSize,T=e.get(de);if(T===void 0)continue;const U=T.buffer,C=T.type,W=T.bytesPerElement,k=C===r.INT||C===r.UNSIGNED_INT||de.gpuType===to;if(de.isInterleavedBufferAttribute){const M=de.data,S=M.stride,L=de.offset;if(M.isInstancedInterleavedBuffer){for(let R=0;R<re.locationSize;R++)d(re.location+R,M.meshPerAttribute);X.isInstancedMesh!==!0&&ae._maxInstanceCount===void 0&&(ae._maxInstanceCount=M.meshPerAttribute*M.count)}else for(let R=0;R<re.locationSize;R++)h(re.location+R);r.bindBuffer(r.ARRAY_BUFFER,U);for(let R=0;R<re.locationSize;R++)v(re.location+R,g/re.locationSize,C,E,S*W,(L+g/re.locationSize*R)*W,k)}else{if(de.isInstancedBufferAttribute){for(let M=0;M<re.locationSize;M++)d(re.location+M,de.meshPerAttribute);X.isInstancedMesh!==!0&&ae._maxInstanceCount===void 0&&(ae._maxInstanceCount=de.meshPerAttribute*de.count)}else for(let M=0;M<re.locationSize;M++)h(re.location+M);r.bindBuffer(r.ARRAY_BUFFER,U);for(let M=0;M<re.locationSize;M++)v(re.location+M,g/re.locationSize,C,E,g*W,g/re.locationSize*M*W,k)}}else if(J!==void 0){const E=J[ce];if(E!==void 0)switch(E.length){case 2:r.vertexAttrib2fv(re.location,E);break;case 3:r.vertexAttrib3fv(re.location,E);break;case 4:r.vertexAttrib4fv(re.location,E);break;default:r.vertexAttrib1fv(re.location,E)}}}}p()}(_,m,b,P),Y!==null&&r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,e.get(Y).buffer))},reset:x,resetDefaultState:f,dispose:function(){x();for(const _ in n){const m=n[_];for(const b in m){const P=m[b];for(const Y in P)l(P[Y].object),delete P[Y];delete m[b]}delete n[_]}},releaseStatesOfGeometry:function(_){if(n[_.id]===void 0)return;const m=n[_.id];for(const b in m){const P=m[b];for(const Y in P)l(P[Y].object),delete P[Y];delete m[b]}delete n[_.id]},releaseStatesOfProgram:function(_){for(const m in n){const b=n[m];if(b[_.id]===void 0)continue;const P=b[_.id];for(const Y in P)l(P[Y].object),delete P[Y];delete b[_.id]}},initAttributes:u,enableAttribute:h,disableUnusedAttributes:p}}function Tu(r,e,t){let n;function i(a,s,o){o!==0&&(r.drawArraysInstanced(n,a,s,o),t.update(s,n,o))}this.setMode=function(a){n=a},this.render=function(a,s){r.drawArrays(n,a,s),t.update(s,n,1)},this.renderInstances=i,this.renderMultiDraw=function(a,s,o){if(o===0)return;const l=e.get("WEBGL_multi_draw");if(l===null)for(let c=0;c<o;c++)this.render(a[c],s[c]);else{l.multiDrawArraysWEBGL(n,a,0,s,0,o);let c=0;for(let u=0;u<o;u++)c+=s[u];t.update(c,n,1)}},this.renderMultiDrawInstances=function(a,s,o,l){if(o===0)return;const c=e.get("WEBGL_multi_draw");if(c===null)for(let u=0;u<a.length;u++)i(a[u],s[u],l[u]);else{c.multiDrawArraysInstancedWEBGL(n,a,0,s,0,l,0,o);let u=0;for(let h=0;h<o;h++)u+=s[h];for(let h=0;h<l.length;h++)t.update(u,n,l[h])}}}function wu(r,e,t,n){let i;function a(h){if(h==="highp"){if(r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.HIGH_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.HIGH_FLOAT).precision>0)return"highp";h="mediump"}return h==="mediump"&&r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.MEDIUM_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let s=t.precision!==void 0?t.precision:"highp";const o=a(s);o!==s&&(s=o);const l=t.logarithmicDepthBuffer===!0,c=r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),u=r.getParameter(r.MAX_VERTEX_TEXTURE_IMAGE_UNITS);return{isWebGL2:!0,getMaxAnisotropy:function(){if(i!==void 0)return i;if(e.has("EXT_texture_filter_anisotropic")===!0){const h=e.get("EXT_texture_filter_anisotropic");i=r.getParameter(h.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i},getMaxPrecision:a,textureFormatReadable:function(h){return h===qt||n.convert(h)===r.getParameter(r.IMPLEMENTATION_COLOR_READ_FORMAT)},textureTypeReadable:function(h){const d=h===rn&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(h!==ui&&n.convert(h)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_TYPE)&&h!==It&&!d)},precision:s,logarithmicDepthBuffer:l,maxTextures:c,maxVertexTextures:u,maxTextureSize:r.getParameter(r.MAX_TEXTURE_SIZE),maxCubemapSize:r.getParameter(r.MAX_CUBE_MAP_TEXTURE_SIZE),maxAttributes:r.getParameter(r.MAX_VERTEX_ATTRIBS),maxVertexUniforms:r.getParameter(r.MAX_VERTEX_UNIFORM_VECTORS),maxVaryings:r.getParameter(r.MAX_VARYING_VECTORS),maxFragmentUniforms:r.getParameter(r.MAX_FRAGMENT_UNIFORM_VECTORS),vertexTextures:u>0,maxSamples:r.getParameter(r.MAX_SAMPLES)}}function Au(r){const e=this;let t=null,n=0,i=!1,a=!1;const s=new On,o=new Le,l={value:null,needsUpdate:!1};function c(u,h,d,p){const v=u!==null?u.length:0;let x=null;if(v!==0){if(x=l.value,p!==!0||x===null){const f=d+4*v,_=h.matrixWorldInverse;o.getNormalMatrix(_),(x===null||x.length<f)&&(x=new Float32Array(f));for(let m=0,b=d;m!==v;++m,b+=4)s.copy(u[m]).applyMatrix4(_,o),s.normal.toArray(x,b),x[b+3]=s.constant}l.value=x,l.needsUpdate=!0}return e.numPlanes=v,e.numIntersection=0,x}this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,h){const d=u.length!==0||h||n!==0||i;return i=h,n=u.length,d},this.beginShadows=function(){a=!0,c(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(u,h){t=c(u,h,0)},this.setState=function(u,h,d){const p=u.clippingPlanes,v=u.clipIntersection,x=u.clipShadows,f=r.get(u);if(!i||p===null||p.length===0||a&&!x)a?c(null):function(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}();else{const _=a?0:n,m=4*_;let b=f.clippingState||null;l.value=b,b=c(p,h,m,d);for(let P=0;P!==m;++P)b[P]=t[P];f.clippingState=b,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=_}}}function Eu(r){let e=new WeakMap;function t(i,a){return a===303?i.mapping=oi:a===304&&(i.mapping=li),i}function n(i){const a=i.target;a.removeEventListener("dispose",n);const s=e.get(a);s!==void 0&&(e.delete(a),s.dispose())}return{get:function(i){if(i&&i.isTexture){const a=i.mapping;if(a===303||a===304){if(e.has(i))return t(e.get(i).texture,i.mapping);{const s=i.image;if(s&&s.height>0){const o=new vu(s.height);return o.fromEquirectangularTexture(r,i),e.set(i,o),i.addEventListener("dispose",n),t(o.texture,i.mapping)}return null}}}return i},dispose:function(){e=new WeakMap}}}class aa extends es{constructor(e=-1,t=1,n=1,i=-1,a=.1,s=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=a,this.far=s,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,a,s){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=a,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let a=n-e,s=n+e,o=i+t,l=i-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;a+=c*this.view.offsetX,s=a+c*this.view.width,o-=u*this.view.offsetY,l=o-u*this.view.height}this.projectionMatrix.makeOrthographic(a,s,o,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}const No=[.125,.215,.35,.446,.526,.582],sa=20,is=new aa,Oo=new Se;let rs=null,as=0,ss=0,os=!1;const Qn=(1+Math.sqrt(5))/2,Ii=1/Qn,Fo=[new z(-Qn,Ii,0),new z(Qn,Ii,0),new z(-Ii,0,Qn),new z(Ii,0,Qn),new z(0,Qn,-Ii),new z(0,Qn,Ii),new z(-1,1,-1),new z(1,1,-1),new z(-1,1,1),new z(1,1,1)];class Bo{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,i=100){rs=this._renderer.getRenderTarget(),as=this._renderer.getActiveCubeFace(),ss=this._renderer.getActiveMipmapLevel(),os=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);const a=this._allocateTargets();return a.depthBuffer=!0,this._sceneToCubeUV(e,n,i,a),t>0&&this._blur(a,0,0,t),this._applyPMREM(a),this._cleanup(a),a}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Vo(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ko(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(rs,as,ss),this._renderer.xr.enabled=os,e.scissorTest=!1,oa(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===oi||e.mapping===li?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),rs=this._renderer.getRenderTarget(),as=this._renderer.getActiveCubeFace(),ss=this._renderer.getActiveMipmapLevel(),os=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Ut,minFilter:Ut,generateMipmaps:!1,type:rn,format:qt,colorSpace:yt,depthBuffer:!1},i=zo(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=zo(e,t,n);const{_lodMax:a}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=function(s){const o=[],l=[],c=[];let u=s;const h=s-4+1+No.length;for(let d=0;d<h;d++){const p=Math.pow(2,u);l.push(p);let v=1/p;d>s-4?v=No[d-s+4-1]:d===0&&(v=0),c.push(v);const x=1/(p-2),f=-x,_=1+x,m=[f,f,_,f,_,_,f,f,_,_,f,_],b=6,P=6,Y=3,D=2,G=1,X=new Float32Array(Y*P*b),j=new Float32Array(D*P*b),K=new Float32Array(G*P*b);for(let $=0;$<b;$++){const se=$%3*2/3-1,J=$>2?0:-1,ce=[se,J,0,se+2/3,J,0,se+2/3,J+1,0,se,J,0,se+2/3,J+1,0,se,J+1,0];X.set(ce,Y*P*$),j.set(m,D*P*$);const re=[$,$,$,$,$,$];K.set(re,G*P*$)}const ae=new Bt;ae.setAttribute("position",new rt(X,Y)),ae.setAttribute("uv",new rt(j,D)),ae.setAttribute("faceIndex",new rt(K,G)),o.push(ae),u>4&&u--}return{lodPlanes:o,sizeLods:l,sigmas:c}}(a)),this._blurMaterial=function(s,o,l){const c=new Float32Array(sa),u=new z(0,1,0);return new ht({name:"SphericalGaussianBlur",defines:{n:sa,CUBEUV_TEXEL_WIDTH:1/o,CUBEUV_TEXEL_HEIGHT:1/l,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:c},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:u}},vertexShader:ls(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}(a,e,t)}return i}_compileMaterial(e){const t=new at(this._lodPlanes[0],e);this._renderer.compile(t,is)}_sceneToCubeUV(e,t,n,i){const a=new At(90,1,t,n),s=[1,-1,1,1,1,1],o=[1,1,1,-1,-1,-1],l=this._renderer,c=l.autoClear,u=l.toneMapping;l.getClearColor(Oo),l.toneMapping=Rn,l.autoClear=!1;const h=new Ot({name:"PMREM.Background",side:Lt,depthWrite:!1,depthTest:!1}),d=new at(new cr,h);let p=!1;const v=e.background;v?v.isColor&&(h.color.copy(v),e.background=null,p=!0):(h.color.copy(Oo),p=!0);for(let x=0;x<6;x++){const f=x%3;f===0?(a.up.set(0,s[x],0),a.lookAt(o[x],0,0)):f===1?(a.up.set(0,0,s[x]),a.lookAt(0,o[x],0)):(a.up.set(0,s[x],0),a.lookAt(0,0,o[x]));const _=this._cubeSize;oa(i,f*_,x>2?_:0,_,_),l.setRenderTarget(i),p&&l.render(d,a),l.render(e,a)}d.geometry.dispose(),d.material.dispose(),l.toneMapping=u,l.autoClear=c,e.background=v}_textureToCubeUV(e,t){const n=this._renderer,i=e.mapping===oi||e.mapping===li;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Vo()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ko());const a=i?this._cubemapMaterial:this._equirectMaterial,s=new at(this._lodPlanes[0],a);a.uniforms.envMap.value=e;const o=this._cubeSize;oa(t,0,0,3*o,2*o),n.setRenderTarget(t),n.render(s,is)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const i=this._lodPlanes.length;for(let a=1;a<i;a++){const s=Math.sqrt(this._sigmas[a]*this._sigmas[a]-this._sigmas[a-1]*this._sigmas[a-1]),o=Fo[(i-a-1)%Fo.length];this._blur(e,a-1,a,s,o)}t.autoClear=n}_blur(e,t,n,i,a){const s=this._pingPongRenderTarget;this._halfBlur(e,s,t,n,i,"latitudinal",a),this._halfBlur(s,e,n,n,i,"longitudinal",a)}_halfBlur(e,t,n,i,a,s,o){const l=this._renderer,c=this._blurMaterial,u=new at(this._lodPlanes[i],c),h=c.uniforms,d=this._sizeLods[n]-1,p=isFinite(a)?Math.PI/(2*d):2*Math.PI/39,v=a/p,x=isFinite(a)?1+Math.floor(3*v):sa,f=[];let _=0;for(let P=0;P<sa;++P){const Y=P/v,D=Math.exp(-Y*Y/2);f.push(D),P===0?_+=D:P<x&&(_+=2*D)}for(let P=0;P<f.length;P++)f[P]=f[P]/_;h.envMap.value=e.texture,h.samples.value=x,h.weights.value=f,h.latitudinal.value=s==="latitudinal",o&&(h.poleAxis.value=o);const{_lodMax:m}=this;h.dTheta.value=p,h.mipInt.value=m-n;const b=this._sizeLods[i];oa(t,3*b*(i>m-4?i-m+4:0),4*(this._cubeSize-b),3*b,2*b),l.setRenderTarget(t),l.render(u,is)}}function zo(r,e,t){const n=new Tt(r,e,t);return n.texture.mapping=Cr,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function oa(r,e,t,n,i){r.viewport.set(e,t,n,i),r.scissor.set(e,t,n,i)}function ko(){return new ht({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:ls(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Vo(){return new ht({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:ls(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function ls(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Ru(r){let e=new WeakMap,t=null;function n(i){const a=i.target;a.removeEventListener("dispose",n);const s=e.get(a);s!==void 0&&(e.delete(a),s.dispose())}return{get:function(i){if(i&&i.isTexture){const a=i.mapping,s=a===303||a===304,o=a===oi||a===li;if(s||o){let l=e.get(i);const c=l!==void 0?l.texture.pmremVersion:0;if(i.isRenderTargetTexture&&i.pmremVersion!==c)return t===null&&(t=new Bo(r)),l=s?t.fromEquirectangular(i,l):t.fromCubemap(i,l),l.texture.pmremVersion=i.pmremVersion,e.set(i,l),l.texture;if(l!==void 0)return l.texture;{const u=i.image;return s&&u&&u.height>0||o&&u&&function(h){let d=0;const p=6;for(let v=0;v<p;v++)h[v]!==void 0&&d++;return d===p}(u)?(t===null&&(t=new Bo(r)),l=s?t.fromEquirectangular(i):t.fromCubemap(i),l.texture.pmremVersion=i.pmremVersion,e.set(i,l),i.addEventListener("dispose",n),l.texture):null}}}return i},dispose:function(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}}}function Cu(r){const e={};function t(n){if(e[n]!==void 0)return e[n];let i;switch(n){case"WEBGL_depth_texture":i=r.getExtension("WEBGL_depth_texture")||r.getExtension("MOZ_WEBGL_depth_texture")||r.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=r.getExtension("EXT_texture_filter_anisotropic")||r.getExtension("MOZ_EXT_texture_filter_anisotropic")||r.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=r.getExtension("WEBGL_compressed_texture_s3tc")||r.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||r.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=r.getExtension("WEBGL_compressed_texture_pvrtc")||r.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=r.getExtension(n)}return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const i=t(n);return i===null&&Fa("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function Pu(r,e,t,n){const i={},a=new WeakMap;function s(l){const c=l.target;c.index!==null&&e.remove(c.index);for(const h in c.attributes)e.remove(c.attributes[h]);for(const h in c.morphAttributes){const d=c.morphAttributes[h];for(let p=0,v=d.length;p<v;p++)e.remove(d[p])}c.removeEventListener("dispose",s),delete i[c.id];const u=a.get(c);u&&(e.remove(u),a.delete(c)),n.releaseStatesOfGeometry(c),c.isInstancedBufferGeometry===!0&&delete c._maxInstanceCount,t.memory.geometries--}function o(l){const c=[],u=l.index,h=l.attributes.position;let d=0;if(u!==null){const x=u.array;d=u.version;for(let f=0,_=x.length;f<_;f+=3){const m=x[f+0],b=x[f+1],P=x[f+2];c.push(m,b,b,P,P,m)}}else{if(h===void 0)return;{const x=h.array;d=h.version;for(let f=0,_=x.length/3-1;f<_;f+=3){const m=f+0,b=f+1,P=f+2;c.push(m,b,b,P,P,m)}}}const p=new(ao(c)?To:Mo)(c,1);p.version=d;const v=a.get(l);v&&e.remove(v),a.set(l,p)}return{get:function(l,c){return i[c.id]===!0||(c.addEventListener("dispose",s),i[c.id]=!0,t.memory.geometries++),c},update:function(l){const c=l.attributes;for(const h in c)e.update(c[h],r.ARRAY_BUFFER);const u=l.morphAttributes;for(const h in u){const d=u[h];for(let p=0,v=d.length;p<v;p++)e.update(d[p],r.ARRAY_BUFFER)}},getWireframeAttribute:function(l){const c=a.get(l);if(c){const u=l.index;u!==null&&c.version<u.version&&o(l)}else o(l);return a.get(l)}}}function Lu(r,e,t){let n,i,a;function s(o,l,c){c!==0&&(r.drawElementsInstanced(n,l,i,o*a,c),t.update(l,n,c))}this.setMode=function(o){n=o},this.setIndex=function(o){i=o.type,a=o.bytesPerElement},this.render=function(o,l){r.drawElements(n,l,i,o*a),t.update(l,n,1)},this.renderInstances=s,this.renderMultiDraw=function(o,l,c){if(c===0)return;const u=e.get("WEBGL_multi_draw");if(u===null)for(let h=0;h<c;h++)this.render(o[h]/a,l[h]);else{u.multiDrawElementsWEBGL(n,l,0,i,o,0,c);let h=0;for(let d=0;d<c;d++)h+=l[d];t.update(h,n,1)}},this.renderMultiDrawInstances=function(o,l,c,u){if(c===0)return;const h=e.get("WEBGL_multi_draw");if(h===null)for(let d=0;d<o.length;d++)s(o[d]/a,l[d],u[d]);else{h.multiDrawElementsInstancedWEBGL(n,l,0,i,o,0,u,0,c);let d=0;for(let p=0;p<c;p++)d+=l[p];for(let p=0;p<u.length;p++)t.update(d,n,u[p])}}}function Du(r){const e={frame:0,calls:0,triangles:0,points:0,lines:0};return{memory:{geometries:0,textures:0},render:e,programs:null,autoReset:!0,reset:function(){e.calls=0,e.triangles=0,e.points=0,e.lines=0},update:function(t,n,i){switch(e.calls++,n){case r.TRIANGLES:e.triangles+=i*(t/3);break;case r.LINES:e.lines+=i*(t/2);break;case r.LINE_STRIP:e.lines+=i*(t-1);break;case r.LINE_LOOP:e.lines+=i*t;break;case r.POINTS:e.points+=i*t}}}}function Uu(r,e,t){const n=new WeakMap,i=new je;return{update:function(a,s,o){const l=a.morphTargetInfluences,c=s.morphAttributes.position||s.morphAttributes.normal||s.morphAttributes.color,u=c!==void 0?c.length:0;let h=n.get(s);if(h===void 0||h.count!==u){let j=function(){G.dispose(),n.delete(s),s.removeEventListener("dispose",j)};var d=j;h!==void 0&&h.texture.dispose();const p=s.morphAttributes.position!==void 0,v=s.morphAttributes.normal!==void 0,x=s.morphAttributes.color!==void 0,f=s.morphAttributes.position||[],_=s.morphAttributes.normal||[],m=s.morphAttributes.color||[];let b=0;p===!0&&(b=1),v===!0&&(b=2),x===!0&&(b=3);let P=s.attributes.position.count*b,Y=1;P>e.maxTextureSize&&(Y=Math.ceil(P/e.maxTextureSize),P=e.maxTextureSize);const D=new Float32Array(P*Y*4*u),G=new uo(D,P,Y,u);G.type=It,G.needsUpdate=!0;const X=4*b;for(let K=0;K<u;K++){const ae=f[K],$=_[K],se=m[K],J=P*Y*4*K;for(let ce=0;ce<ae.count;ce++){const re=ce*X;p===!0&&(i.fromBufferAttribute(ae,ce),D[J+re+0]=i.x,D[J+re+1]=i.y,D[J+re+2]=i.z,D[J+re+3]=0),v===!0&&(i.fromBufferAttribute($,ce),D[J+re+4]=i.x,D[J+re+5]=i.y,D[J+re+6]=i.z,D[J+re+7]=0),x===!0&&(i.fromBufferAttribute(se,ce),D[J+re+8]=i.x,D[J+re+9]=i.y,D[J+re+10]=i.z,D[J+re+11]=se.itemSize===4?i.w:1)}}h={count:u,texture:G,size:new _e(P,Y)},n.set(s,h),s.addEventListener("dispose",j)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)o.getUniforms().setValue(r,"morphTexture",a.morphTexture,t);else{let p=0;for(let x=0;x<l.length;x++)p+=l[x];const v=s.morphTargetsRelative?1:1-p;o.getUniforms().setValue(r,"morphTargetBaseInfluence",v),o.getUniforms().setValue(r,"morphTargetInfluences",l)}o.getUniforms().setValue(r,"morphTargetsTexture",h.texture,t),o.getUniforms().setValue(r,"morphTargetsTextureSize",h.size)}}}function Iu(r,e,t,n){let i=new WeakMap;function a(s){const o=s.target;o.removeEventListener("dispose",a),t.remove(o.instanceMatrix),o.instanceColor!==null&&t.remove(o.instanceColor)}return{update:function(s){const o=n.render.frame,l=s.geometry,c=e.get(s,l);if(i.get(c)!==o&&(e.update(c),i.set(c,o)),s.isInstancedMesh&&(s.hasEventListener("dispose",a)===!1&&s.addEventListener("dispose",a),i.get(s)!==o&&(t.update(s.instanceMatrix,r.ARRAY_BUFFER),s.instanceColor!==null&&t.update(s.instanceColor,r.ARRAY_BUFFER),i.set(s,o))),s.isSkinnedMesh){const u=s.skeleton;i.get(u)!==o&&(u.update(),i.set(u,o))}return c},dispose:function(){i=new WeakMap}}}class Ho extends nt{constructor(e,t,n,i,a,s,o,l,c,u=1026){if(u!==Qi&&u!==pi)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&u===Qi&&(n=hi),n===void 0&&u===pi&&(n=di),super(null,i,a,s,o,l,u,n,c),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=o!==void 0?o:ut,this.minFilter=l!==void 0?l:ut,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}const Go=new nt,Wo=new Ho(1,1);Wo.compareFunction=515;const jo=new uo,Xo=new su,qo=new Uo,Yo=[],Ko=[],Zo=new Float32Array(16),Jo=new Float32Array(9),Qo=new Float32Array(4);function Ni(r,e,t){const n=r[0];if(n<=0||n>0)return r;const i=e*t;let a=Yo[i];if(a===void 0&&(a=new Float32Array(i),Yo[i]=a),e!==0){n.toArray(a,0);for(let s=1,o=0;s!==e;++s)o+=t,r[s].toArray(a,o)}return a}function dt(r,e){if(r.length!==e.length)return!1;for(let t=0,n=r.length;t<n;t++)if(r[t]!==e[t])return!1;return!0}function pt(r,e){for(let t=0,n=e.length;t<n;t++)r[t]=e[t]}function la(r,e){let t=Ko[e];t===void 0&&(t=new Int32Array(e),Ko[e]=t);for(let n=0;n!==e;++n)t[n]=r.allocateTextureUnit();return t}function Nu(r,e){const t=this.cache;t[0]!==e&&(r.uniform1f(this.addr,e),t[0]=e)}function Ou(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(r.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(dt(t,e))return;r.uniform2fv(this.addr,e),pt(t,e)}}function Fu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(r.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)t[0]===e.r&&t[1]===e.g&&t[2]===e.b||(r.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(dt(t,e))return;r.uniform3fv(this.addr,e),pt(t,e)}}function Bu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(r.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(dt(t,e))return;r.uniform4fv(this.addr,e),pt(t,e)}}function zu(r,e){const t=this.cache,n=e.elements;if(n===void 0){if(dt(t,e))return;r.uniformMatrix2fv(this.addr,!1,e),pt(t,e)}else{if(dt(t,n))return;Qo.set(n),r.uniformMatrix2fv(this.addr,!1,Qo),pt(t,n)}}function ku(r,e){const t=this.cache,n=e.elements;if(n===void 0){if(dt(t,e))return;r.uniformMatrix3fv(this.addr,!1,e),pt(t,e)}else{if(dt(t,n))return;Jo.set(n),r.uniformMatrix3fv(this.addr,!1,Jo),pt(t,n)}}function Vu(r,e){const t=this.cache,n=e.elements;if(n===void 0){if(dt(t,e))return;r.uniformMatrix4fv(this.addr,!1,e),pt(t,e)}else{if(dt(t,n))return;Zo.set(n),r.uniformMatrix4fv(this.addr,!1,Zo),pt(t,n)}}function Hu(r,e){const t=this.cache;t[0]!==e&&(r.uniform1i(this.addr,e),t[0]=e)}function Gu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(r.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(dt(t,e))return;r.uniform2iv(this.addr,e),pt(t,e)}}function Wu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(r.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(dt(t,e))return;r.uniform3iv(this.addr,e),pt(t,e)}}function ju(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(r.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(dt(t,e))return;r.uniform4iv(this.addr,e),pt(t,e)}}function Xu(r,e){const t=this.cache;t[0]!==e&&(r.uniform1ui(this.addr,e),t[0]=e)}function qu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(r.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(dt(t,e))return;r.uniform2uiv(this.addr,e),pt(t,e)}}function Yu(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(r.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(dt(t,e))return;r.uniform3uiv(this.addr,e),pt(t,e)}}function Ku(r,e){const t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(r.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(dt(t,e))return;r.uniform4uiv(this.addr,e),pt(t,e)}}function Zu(r,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i);const a=this.type===r.SAMPLER_2D_SHADOW?Wo:Go;t.setTexture2D(e||a,i)}function Ju(r,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||Xo,i)}function Qu(r,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||qo,i)}function $u(r,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||jo,i)}function eh(r,e){r.uniform1fv(this.addr,e)}function th(r,e){const t=Ni(e,this.size,2);r.uniform2fv(this.addr,t)}function nh(r,e){const t=Ni(e,this.size,3);r.uniform3fv(this.addr,t)}function ih(r,e){const t=Ni(e,this.size,4);r.uniform4fv(this.addr,t)}function rh(r,e){const t=Ni(e,this.size,4);r.uniformMatrix2fv(this.addr,!1,t)}function ah(r,e){const t=Ni(e,this.size,9);r.uniformMatrix3fv(this.addr,!1,t)}function sh(r,e){const t=Ni(e,this.size,16);r.uniformMatrix4fv(this.addr,!1,t)}function oh(r,e){r.uniform1iv(this.addr,e)}function lh(r,e){r.uniform2iv(this.addr,e)}function ch(r,e){r.uniform3iv(this.addr,e)}function uh(r,e){r.uniform4iv(this.addr,e)}function hh(r,e){r.uniform1uiv(this.addr,e)}function dh(r,e){r.uniform2uiv(this.addr,e)}function ph(r,e){r.uniform3uiv(this.addr,e)}function fh(r,e){r.uniform4uiv(this.addr,e)}function mh(r,e,t){const n=this.cache,i=e.length,a=la(t,i);dt(n,a)||(r.uniform1iv(this.addr,a),pt(n,a));for(let s=0;s!==i;++s)t.setTexture2D(e[s]||Go,a[s])}function gh(r,e,t){const n=this.cache,i=e.length,a=la(t,i);dt(n,a)||(r.uniform1iv(this.addr,a),pt(n,a));for(let s=0;s!==i;++s)t.setTexture3D(e[s]||Xo,a[s])}function vh(r,e,t){const n=this.cache,i=e.length,a=la(t,i);dt(n,a)||(r.uniform1iv(this.addr,a),pt(n,a));for(let s=0;s!==i;++s)t.setTextureCube(e[s]||qo,a[s])}function xh(r,e,t){const n=this.cache,i=e.length,a=la(t,i);dt(n,a)||(r.uniform1iv(this.addr,a),pt(n,a));for(let s=0;s!==i;++s)t.setTexture2DArray(e[s]||jo,a[s])}class _h{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=function(i){switch(i){case 5126:return Nu;case 35664:return Ou;case 35665:return Fu;case 35666:return Bu;case 35674:return zu;case 35675:return ku;case 35676:return Vu;case 5124:case 35670:return Hu;case 35667:case 35671:return Gu;case 35668:case 35672:return Wu;case 35669:case 35673:return ju;case 5125:return Xu;case 36294:return qu;case 36295:return Yu;case 36296:return Ku;case 35678:case 36198:case 36298:case 36306:case 35682:return Zu;case 35679:case 36299:case 36307:return Ju;case 35680:case 36300:case 36308:case 36293:return Qu;case 36289:case 36303:case 36311:case 36292:return $u}}(t.type)}}class yh{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=function(i){switch(i){case 5126:return eh;case 35664:return th;case 35665:return nh;case 35666:return ih;case 35674:return rh;case 35675:return ah;case 35676:return sh;case 5124:case 35670:return oh;case 35667:case 35671:return lh;case 35668:case 35672:return ch;case 35669:case 35673:return uh;case 5125:return hh;case 36294:return dh;case 36295:return ph;case 36296:return fh;case 35678:case 36198:case 36298:case 36306:case 35682:return mh;case 35679:case 36299:case 36307:return gh;case 35680:case 36300:case 36308:case 36293:return vh;case 36289:case 36303:case 36311:case 36292:return xh}}(t.type)}}class bh{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const i=this.seq;for(let a=0,s=i.length;a!==s;++a){const o=i[a];o.setValue(e,t[o.id],n)}}}const cs=/(\w+)(\])?(\[|\.)?/g;function $o(r,e){r.seq.push(e),r.map[e.id]=e}function Sh(r,e,t){const n=r.name,i=n.length;for(cs.lastIndex=0;;){const a=cs.exec(n),s=cs.lastIndex;let o=a[1];const l=a[2]==="]",c=a[3];if(l&&(o|=0),c===void 0||c==="["&&s+2===i){$o(t,c===void 0?new _h(o,r,e):new yh(o,r,e));break}{let u=t.map[o];u===void 0&&(u=new bh(o),$o(t,u)),t=u}}}class ca{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){const a=e.getActiveUniform(t,i);Sh(a,e.getUniformLocation(t,a.name),this)}}setValue(e,t,n,i){const a=this.map[t];a!==void 0&&a.setValue(e,n,i)}setOptional(e,t,n){const i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let a=0,s=t.length;a!==s;++a){const o=t[a],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,i)}}static seqWithValue(e,t){const n=[];for(let i=0,a=e.length;i!==a;++i){const s=e[i];s.id in t&&n.push(s)}return n}}function el(r,e,t){const n=r.createShader(e);return r.shaderSource(n,t),r.compileShader(n),n}const Mh=37297;let Th=0;function tl(r,e,t){const n=r.getShaderParameter(e,r.COMPILE_STATUS),i=r.getShaderInfoLog(e).trim();if(n&&i==="")return"";const a=/ERROR: 0:(\d+)/.exec(i);if(a){const s=parseInt(a[1]);return t.toUpperCase()+`

`+i+`

`+function(o,l){const c=o.split(`
`),u=[],h=Math.max(l-6,0),d=Math.min(l+6,c.length);for(let p=h;p<d;p++){const v=p+1;u.push(`${v===l?">":" "} ${v}: ${c[p]}`)}return u.join(`
`)}(r.getShaderSource(e),s)}return i}function wh(r,e){const t=function(n){const i=Ve.getPrimaries(Ve.workingColorSpace),a=Ve.getPrimaries(n);let s;switch(i===a?s="":i===Fr&&a===Or?s="LinearDisplayP3ToLinearSRGB":i===Or&&a===Fr&&(s="LinearSRGBToLinearDisplayP3"),n){case yt:case Ir:return[s,"LinearTransferOETF"];case _t:case Ua:return[s,"sRGBTransferOETF"];default:return[s,"LinearTransferOETF"]}}(e);return`vec4 ${r}( vec4 value ) { return ${t[0]}( ${t[1]}( value ) ); }`}function Ah(r,e){let t;switch(e){case Bc:t="Linear";break;case zc:t="Reinhard";break;case kc:t="OptimizedCineon";break;case Vc:t="ACESFilmic";break;case Gc:t="AgX";break;case Wc:t="Neutral";break;case Hc:t="Custom";break;default:t="Linear"}return"vec3 "+r+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}function ur(r){return r!==""}function nl(r,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return r.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function il(r,e){return r.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Eh=/^[ \t]*#include +<([\w\d./]+)>/gm;function us(r){return r.replace(Eh,Ch)}const Rh=new Map;function Ch(r,e){let t=De[e];if(t===void 0){const n=Rh.get(e);if(n===void 0)throw new Error("Can not resolve #include <"+e+">");t=De[n]}return us(t)}const Ph=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function rl(r){return r.replace(Ph,Lh)}function Lh(r,e,t,n){let i="";for(let a=parseInt(e);a<parseInt(t);a++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+a+" ]").replace(/UNROLLED_LOOP_INDEX/g,a);return i}function al(r){let e=`precision ${r.precision} float;
	precision ${r.precision} int;
	precision ${r.precision} sampler2D;
	precision ${r.precision} samplerCube;
	precision ${r.precision} sampler3D;
	precision ${r.precision} sampler2DArray;
	precision ${r.precision} sampler2DShadow;
	precision ${r.precision} samplerCubeShadow;
	precision ${r.precision} sampler2DArrayShadow;
	precision ${r.precision} isampler2D;
	precision ${r.precision} isampler3D;
	precision ${r.precision} isamplerCube;
	precision ${r.precision} isampler2DArray;
	precision ${r.precision} usampler2D;
	precision ${r.precision} usampler3D;
	precision ${r.precision} usamplerCube;
	precision ${r.precision} usampler2DArray;
	`;return r.precision==="highp"?e+=`
#define HIGH_PRECISION`:r.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:r.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function Dh(r,e,t,n){const i=r.getContext(),a=t.defines;let s=t.vertexShader,o=t.fragmentShader;const l=function(ae){let $="SHADOWMAP_TYPE_BASIC";return ae.shadowMapType===Qs?$="SHADOWMAP_TYPE_PCF":ae.shadowMapType===vc?$="SHADOWMAP_TYPE_PCF_SOFT":ae.shadowMapType===vn&&($="SHADOWMAP_TYPE_VSM"),$}(t),c=function(ae){let $="ENVMAP_TYPE_CUBE";if(ae.envMap)switch(ae.envMapMode){case oi:case li:$="ENVMAP_TYPE_CUBE";break;case Cr:$="ENVMAP_TYPE_CUBE_UV"}return $}(t),u=function(ae){let $="ENVMAP_MODE_REFLECTION";return ae.envMap&&ae.envMapMode===li&&($="ENVMAP_MODE_REFRACTION"),$}(t),h=function(ae){let $="ENVMAP_BLENDING_NONE";if(ae.envMap)switch(ae.combine){case $s:$="ENVMAP_BLENDING_MULTIPLY";break;case Oc:$="ENVMAP_BLENDING_MIX";break;case Fc:$="ENVMAP_BLENDING_ADD"}return $}(t),d=function(ae){const $=ae.envMapCubeUVHeight;if($===null)return null;const se=Math.log2($)-2,J=1/$;return{texelWidth:1/(3*Math.max(Math.pow(2,se),112)),texelHeight:J,maxMip:se}}(t),p=function(ae){return[ae.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",ae.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(ur).join(`
`)}(t),v=function(ae){const $=[];for(const se in ae){const J=ae[se];J!==!1&&$.push("#define "+se+" "+J)}return $.join(`
`)}(a),x=i.createProgram();let f,_,m=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v].filter(ur).join(`
`),f.length>0&&(f+=`
`),_=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v].filter(ur).join(`
`),_.length>0&&(_+=`
`)):(f=[al(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(ur).join(`
`),_=[al(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+u:"",t.envMap?"#define "+h:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Rn?"#define TONE_MAPPING":"",t.toneMapping!==Rn?De.tonemapping_pars_fragment:"",t.toneMapping!==Rn?Ah("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",De.colorspace_pars_fragment,wh("linearToOutputTexel",t.outputColorSpace),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(ur).join(`
`)),s=us(s),s=nl(s,t),s=il(s,t),o=us(o),o=nl(o,t),o=il(o,t),s=rl(s),o=rl(o),t.isRawShaderMaterial!==!0&&(m=`#version 300 es
`,f=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+f,_=["#define varying in",t.glslVersion===no?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===no?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+_);const b=m+f+s,P=m+_+o,Y=el(i,i.VERTEX_SHADER,b),D=el(i,i.FRAGMENT_SHADER,P);function G(ae){if(r.debug.checkShaderErrors){const $=i.getProgramInfoLog(x).trim(),se=i.getShaderInfoLog(Y).trim(),J=i.getShaderInfoLog(D).trim();let ce=!0,re=!0;i.getProgramParameter(x,i.LINK_STATUS)===!1?(ce=!1,typeof r.debug.onShaderError=="function"?r.debug.onShaderError(i,x,Y,D):(tl(i,Y,"vertex"),tl(i,D,"fragment"))):$!==""||se!==""&&J!==""||(re=!1),re&&(ae.diagnostics={runnable:ce,programLog:$,vertexShader:{log:se,prefix:f},fragmentShader:{log:J,prefix:_}})}i.deleteShader(Y),i.deleteShader(D),X=new ca(i,x),j=function($,se){const J={},ce=$.getProgramParameter(se,$.ACTIVE_ATTRIBUTES);for(let re=0;re<ce;re++){const de=$.getActiveAttrib(se,re),E=de.name;let g=1;de.type===$.FLOAT_MAT2&&(g=2),de.type===$.FLOAT_MAT3&&(g=3),de.type===$.FLOAT_MAT4&&(g=4),J[E]={type:de.type,location:$.getAttribLocation(se,E),locationSize:g}}return J}(i,x)}let X,j;i.attachShader(x,Y),i.attachShader(x,D),t.index0AttributeName!==void 0?i.bindAttribLocation(x,0,t.index0AttributeName):t.morphTargets===!0&&i.bindAttribLocation(x,0,"position"),i.linkProgram(x),this.getUniforms=function(){return X===void 0&&G(this),X},this.getAttributes=function(){return j===void 0&&G(this),j};let K=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return K===!1&&(K=i.getProgramParameter(x,Mh)),K},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(x),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Th++,this.cacheKey=e,this.usedTimes=1,this.program=x,this.vertexShader=Y,this.fragmentShader=D,this}let Uh=0;class Ih{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,n=e.fragmentShader,i=this._getShaderStage(t),a=this._getShaderStage(n),s=this._getShaderCacheForMaterial(e);return s.has(i)===!1&&(s.add(i),i.usedTimes++),s.has(a)===!1&&(s.add(a),a.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new Nh(e),t.set(e,n)),n}}class Nh{constructor(e){this.id=Uh++,this.code=e,this.usedTimes=0}}function Oh(r,e,t,n,i,a,s){const o=new mo,l=new Ih,c=new Set,u=[],h=i.logarithmicDepthBuffer,d=i.vertexTextures;let p=i.precision;const v={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function x(f){return c.add(f),f===0?"uv":`uv${f}`}return{getParameters:function(f,_,m,b,P){const Y=b.fog,D=P.geometry,G=f.isMeshStandardMaterial?b.environment:null,X=(f.isMeshStandardMaterial?t:e).get(f.envMap||G),j=X&&X.mapping===Cr?X.image.height:null,K=v[f.type];f.precision!==null&&(p=i.getMaxPrecision(f.precision),f.precision);const ae=D.morphAttributes.position||D.morphAttributes.normal||D.morphAttributes.color,$=ae!==void 0?ae.length:0;let se,J,ce,re,de=0;if(D.morphAttributes.position!==void 0&&(de=1),D.morphAttributes.normal!==void 0&&(de=2),D.morphAttributes.color!==void 0&&(de=3),K){const En=un[K];se=En.vertexShader,J=En.fragmentShader}else se=f.vertexShader,J=f.fragmentShader,l.update(f),ce=l.getVertexShaderID(f),re=l.getFragmentShaderID(f);const E=r.getRenderTarget(),g=P.isInstancedMesh===!0,T=P.isBatchedMesh===!0,U=!!f.map,C=!!f.matcap,W=!!X,k=!!f.aoMap,M=!!f.lightMap,S=!!f.bumpMap,L=!!f.normalMap,R=!!f.displacementMap,I=!!f.emissiveMap,F=!!f.metalnessMap,y=!!f.roughnessMap,N=f.anisotropy>0,w=f.clearcoat>0,V=f.dispersion>0,B=f.iridescence>0,ne=f.sheen>0,oe=f.transmission>0,O=N&&!!f.anisotropyMap,q=w&&!!f.clearcoatMap,Q=w&&!!f.clearcoatNormalMap,ue=w&&!!f.clearcoatRoughnessMap,me=B&&!!f.iridescenceMap,Ae=B&&!!f.iridescenceThicknessMap,Re=ne&&!!f.sheenColorMap,fe=ne&&!!f.sheenRoughnessMap,we=!!f.specularMap,ge=!!f.specularColorMap,We=!!f.specularIntensityMap,ve=oe&&!!f.transmissionMap,Te=oe&&!!f.thicknessMap,be=!!f.gradientMap,Ye=!!f.alphaMap,ot=f.alphaTest>0,H=!!f.alphaHash,ft=!!f.extensions;let zt=Rn;f.toneMapped&&(E!==null&&E.isXRRenderTarget!==!0||(zt=r.toneMapping));const Ke={shaderID:K,shaderType:f.type,shaderName:f.name,vertexShader:se,fragmentShader:J,defines:f.defines,customVertexShaderID:ce,customFragmentShaderID:re,isRawShaderMaterial:f.isRawShaderMaterial===!0,glslVersion:f.glslVersion,precision:p,batching:T,batchingColor:T&&P._colorsTexture!==null,instancing:g,instancingColor:g&&P.instanceColor!==null,instancingMorph:g&&P.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:E===null?r.outputColorSpace:E.isXRRenderTarget===!0?E.texture.colorSpace:yt,alphaToCoverage:!!f.alphaToCoverage,map:U,matcap:C,envMap:W,envMapMode:W&&X.mapping,envMapCubeUVHeight:j,aoMap:k,lightMap:M,bumpMap:S,normalMap:L,displacementMap:d&&R,emissiveMap:I,normalMapObjectSpace:L&&f.normalMapType===1,normalMapTangentSpace:L&&f.normalMapType===0,metalnessMap:F,roughnessMap:y,anisotropy:N,anisotropyMap:O,clearcoat:w,clearcoatMap:q,clearcoatNormalMap:Q,clearcoatRoughnessMap:ue,dispersion:V,iridescence:B,iridescenceMap:me,iridescenceThicknessMap:Ae,sheen:ne,sheenColorMap:Re,sheenRoughnessMap:fe,specularMap:we,specularColorMap:ge,specularIntensityMap:We,transmission:oe,transmissionMap:ve,thicknessMap:Te,gradientMap:be,opaque:f.transparent===!1&&f.blending===1&&f.alphaToCoverage===!1,alphaMap:Ye,alphaTest:ot,alphaHash:H,combine:f.combine,mapUv:U&&x(f.map.channel),aoMapUv:k&&x(f.aoMap.channel),lightMapUv:M&&x(f.lightMap.channel),bumpMapUv:S&&x(f.bumpMap.channel),normalMapUv:L&&x(f.normalMap.channel),displacementMapUv:R&&x(f.displacementMap.channel),emissiveMapUv:I&&x(f.emissiveMap.channel),metalnessMapUv:F&&x(f.metalnessMap.channel),roughnessMapUv:y&&x(f.roughnessMap.channel),anisotropyMapUv:O&&x(f.anisotropyMap.channel),clearcoatMapUv:q&&x(f.clearcoatMap.channel),clearcoatNormalMapUv:Q&&x(f.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ue&&x(f.clearcoatRoughnessMap.channel),iridescenceMapUv:me&&x(f.iridescenceMap.channel),iridescenceThicknessMapUv:Ae&&x(f.iridescenceThicknessMap.channel),sheenColorMapUv:Re&&x(f.sheenColorMap.channel),sheenRoughnessMapUv:fe&&x(f.sheenRoughnessMap.channel),specularMapUv:we&&x(f.specularMap.channel),specularColorMapUv:ge&&x(f.specularColorMap.channel),specularIntensityMapUv:We&&x(f.specularIntensityMap.channel),transmissionMapUv:ve&&x(f.transmissionMap.channel),thicknessMapUv:Te&&x(f.thicknessMap.channel),alphaMapUv:Ye&&x(f.alphaMap.channel),vertexTangents:!!D.attributes.tangent&&(L||N),vertexColors:f.vertexColors,vertexAlphas:f.vertexColors===!0&&!!D.attributes.color&&D.attributes.color.itemSize===4,pointsUvs:P.isPoints===!0&&!!D.attributes.uv&&(U||Ye),fog:!!Y,useFog:f.fog===!0,fogExp2:!!Y&&Y.isFogExp2,flatShading:f.flatShading===!0,sizeAttenuation:f.sizeAttenuation===!0,logarithmicDepthBuffer:h,skinning:P.isSkinnedMesh===!0,morphTargets:D.morphAttributes.position!==void 0,morphNormals:D.morphAttributes.normal!==void 0,morphColors:D.morphAttributes.color!==void 0,morphTargetsCount:$,morphTextureStride:de,numDirLights:_.directional.length,numPointLights:_.point.length,numSpotLights:_.spot.length,numSpotLightMaps:_.spotLightMap.length,numRectAreaLights:_.rectArea.length,numHemiLights:_.hemi.length,numDirLightShadows:_.directionalShadowMap.length,numPointLightShadows:_.pointShadowMap.length,numSpotLightShadows:_.spotShadowMap.length,numSpotLightShadowsWithMaps:_.numSpotLightShadowsWithMaps,numLightProbes:_.numLightProbes,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:f.dithering,shadowMapEnabled:r.shadowMap.enabled&&m.length>0,shadowMapType:r.shadowMap.type,toneMapping:zt,decodeVideoTexture:U&&f.map.isVideoTexture===!0&&Ve.getTransfer(f.map.colorSpace)===Ze,premultipliedAlpha:f.premultipliedAlpha,doubleSided:f.side===2,flipSided:f.side===Lt,useDepthPacking:f.depthPacking>=0,depthPacking:f.depthPacking||0,index0AttributeName:f.index0AttributeName,extensionClipCullDistance:ft&&f.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:ft&&f.extensions.multiDraw===!0&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:f.customProgramCacheKey()};return Ke.vertexUv1s=c.has(1),Ke.vertexUv2s=c.has(2),Ke.vertexUv3s=c.has(3),c.clear(),Ke},getProgramCacheKey:function(f){const _=[];if(f.shaderID?_.push(f.shaderID):(_.push(f.customVertexShaderID),_.push(f.customFragmentShaderID)),f.defines!==void 0)for(const m in f.defines)_.push(m),_.push(f.defines[m]);return f.isRawShaderMaterial===!1&&(function(m,b){m.push(b.precision),m.push(b.outputColorSpace),m.push(b.envMapMode),m.push(b.envMapCubeUVHeight),m.push(b.mapUv),m.push(b.alphaMapUv),m.push(b.lightMapUv),m.push(b.aoMapUv),m.push(b.bumpMapUv),m.push(b.normalMapUv),m.push(b.displacementMapUv),m.push(b.emissiveMapUv),m.push(b.metalnessMapUv),m.push(b.roughnessMapUv),m.push(b.anisotropyMapUv),m.push(b.clearcoatMapUv),m.push(b.clearcoatNormalMapUv),m.push(b.clearcoatRoughnessMapUv),m.push(b.iridescenceMapUv),m.push(b.iridescenceThicknessMapUv),m.push(b.sheenColorMapUv),m.push(b.sheenRoughnessMapUv),m.push(b.specularMapUv),m.push(b.specularColorMapUv),m.push(b.specularIntensityMapUv),m.push(b.transmissionMapUv),m.push(b.thicknessMapUv),m.push(b.combine),m.push(b.fogExp2),m.push(b.sizeAttenuation),m.push(b.morphTargetsCount),m.push(b.morphAttributeCount),m.push(b.numDirLights),m.push(b.numPointLights),m.push(b.numSpotLights),m.push(b.numSpotLightMaps),m.push(b.numHemiLights),m.push(b.numRectAreaLights),m.push(b.numDirLightShadows),m.push(b.numPointLightShadows),m.push(b.numSpotLightShadows),m.push(b.numSpotLightShadowsWithMaps),m.push(b.numLightProbes),m.push(b.shadowMapType),m.push(b.toneMapping),m.push(b.numClippingPlanes),m.push(b.numClipIntersection),m.push(b.depthPacking)}(_,f),function(m,b){o.disableAll(),b.supportsVertexTextures&&o.enable(0),b.instancing&&o.enable(1),b.instancingColor&&o.enable(2),b.instancingMorph&&o.enable(3),b.matcap&&o.enable(4),b.envMap&&o.enable(5),b.normalMapObjectSpace&&o.enable(6),b.normalMapTangentSpace&&o.enable(7),b.clearcoat&&o.enable(8),b.iridescence&&o.enable(9),b.alphaTest&&o.enable(10),b.vertexColors&&o.enable(11),b.vertexAlphas&&o.enable(12),b.vertexUv1s&&o.enable(13),b.vertexUv2s&&o.enable(14),b.vertexUv3s&&o.enable(15),b.vertexTangents&&o.enable(16),b.anisotropy&&o.enable(17),b.alphaHash&&o.enable(18),b.batching&&o.enable(19),b.dispersion&&o.enable(20),b.batchingColor&&o.enable(21),m.push(o.mask),o.disableAll(),b.fog&&o.enable(0),b.useFog&&o.enable(1),b.flatShading&&o.enable(2),b.logarithmicDepthBuffer&&o.enable(3),b.skinning&&o.enable(4),b.morphTargets&&o.enable(5),b.morphNormals&&o.enable(6),b.morphColors&&o.enable(7),b.premultipliedAlpha&&o.enable(8),b.shadowMapEnabled&&o.enable(9),b.doubleSided&&o.enable(10),b.flipSided&&o.enable(11),b.useDepthPacking&&o.enable(12),b.dithering&&o.enable(13),b.transmission&&o.enable(14),b.sheen&&o.enable(15),b.opaque&&o.enable(16),b.pointsUvs&&o.enable(17),b.decodeVideoTexture&&o.enable(18),b.alphaToCoverage&&o.enable(19),m.push(o.mask)}(_,f),_.push(r.outputColorSpace)),_.push(f.customProgramCacheKey),_.join()},getUniforms:function(f){const _=v[f.type];let m;if(_){const b=un[_];m=Kn.clone(b.uniforms)}else m=f.uniforms;return m},acquireProgram:function(f,_){let m;for(let b=0,P=u.length;b<P;b++){const Y=u[b];if(Y.cacheKey===_){m=Y,++m.usedTimes;break}}return m===void 0&&(m=new Dh(r,_,f,a),u.push(m)),m},releaseProgram:function(f){if(--f.usedTimes==0){const _=u.indexOf(f);u[_]=u[u.length-1],u.pop(),f.destroy()}},releaseShaderCache:function(f){l.remove(f)},programs:u,dispose:function(){l.dispose()}}}function Fh(){let r=new WeakMap;return{get:function(e){let t=r.get(e);return t===void 0&&(t={},r.set(e,t)),t},remove:function(e){r.delete(e)},update:function(e,t,n){r.get(e)[t]=n},dispose:function(){r=new WeakMap}}}function Bh(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.material.id!==e.material.id?r.material.id-e.material.id:r.z!==e.z?r.z-e.z:r.id-e.id}function sl(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.z!==e.z?e.z-r.z:r.id-e.id}function ol(){const r=[];let e=0;const t=[],n=[],i=[];function a(s,o,l,c,u,h){let d=r[e];return d===void 0?(d={id:s.id,object:s,geometry:o,material:l,groupOrder:c,renderOrder:s.renderOrder,z:u,group:h},r[e]=d):(d.id=s.id,d.object=s,d.geometry=o,d.material=l,d.groupOrder=c,d.renderOrder=s.renderOrder,d.z=u,d.group=h),e++,d}return{opaque:t,transmissive:n,transparent:i,init:function(){e=0,t.length=0,n.length=0,i.length=0},push:function(s,o,l,c,u,h){const d=a(s,o,l,c,u,h);l.transmission>0?n.push(d):l.transparent===!0?i.push(d):t.push(d)},unshift:function(s,o,l,c,u,h){const d=a(s,o,l,c,u,h);l.transmission>0?n.unshift(d):l.transparent===!0?i.unshift(d):t.unshift(d)},finish:function(){for(let s=e,o=r.length;s<o;s++){const l=r[s];if(l.id===null)break;l.id=null,l.object=null,l.geometry=null,l.material=null,l.group=null}},sort:function(s,o){t.length>1&&t.sort(s||Bh),n.length>1&&n.sort(o||sl),i.length>1&&i.sort(o||sl)}}}function zh(){let r=new WeakMap;return{get:function(e,t){const n=r.get(e);let i;return n===void 0?(i=new ol,r.set(e,[i])):t>=n.length?(i=new ol,n.push(i)):i=n[t],i},dispose:function(){r=new WeakMap}}}function kh(){const r={};return{get:function(e){if(r[e.id]!==void 0)return r[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new z,color:new Se};break;case"SpotLight":t={position:new z,direction:new z,color:new Se,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new z,color:new Se,distance:0,decay:0};break;case"HemisphereLight":t={direction:new z,skyColor:new Se,groundColor:new Se};break;case"RectAreaLight":t={color:new Se,position:new z,halfWidth:new z,halfHeight:new z}}return r[e.id]=t,t}}}let Vh=0;function Hh(r,e){return(e.castShadow?2:0)-(r.castShadow?2:0)+(e.map?1:0)-(r.map?1:0)}function Gh(r){const e=new kh,t=function(){const o={};return{get:function(l){if(o[l.id]!==void 0)return o[l.id];let c;switch(l.type){case"DirectionalLight":case"SpotLight":c={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _e};break;case"PointLight":c={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _e,shadowCameraNear:1,shadowCameraFar:1e3}}return o[l.id]=c,c}}}(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let o=0;o<9;o++)n.probe.push(new z);const i=new z,a=new Pe,s=new Pe;return{setup:function(o){let l=0,c=0,u=0;for(let G=0;G<9;G++)n.probe[G].set(0,0,0);let h=0,d=0,p=0,v=0,x=0,f=0,_=0,m=0,b=0,P=0,Y=0;o.sort(Hh);for(let G=0,X=o.length;G<X;G++){const j=o[G],K=j.color,ae=j.intensity,$=j.distance,se=j.shadow&&j.shadow.map?j.shadow.map.texture:null;if(j.isAmbientLight)l+=K.r*ae,c+=K.g*ae,u+=K.b*ae;else if(j.isLightProbe){for(let J=0;J<9;J++)n.probe[J].addScaledVector(j.sh.coefficients[J],ae);Y++}else if(j.isDirectionalLight){const J=e.get(j);if(J.color.copy(j.color).multiplyScalar(j.intensity),j.castShadow){const ce=j.shadow,re=t.get(j);re.shadowBias=ce.bias,re.shadowNormalBias=ce.normalBias,re.shadowRadius=ce.radius,re.shadowMapSize=ce.mapSize,n.directionalShadow[h]=re,n.directionalShadowMap[h]=se,n.directionalShadowMatrix[h]=j.shadow.matrix,f++}n.directional[h]=J,h++}else if(j.isSpotLight){const J=e.get(j);J.position.setFromMatrixPosition(j.matrixWorld),J.color.copy(K).multiplyScalar(ae),J.distance=$,J.coneCos=Math.cos(j.angle),J.penumbraCos=Math.cos(j.angle*(1-j.penumbra)),J.decay=j.decay,n.spot[p]=J;const ce=j.shadow;if(j.map&&(n.spotLightMap[b]=j.map,b++,ce.updateMatrices(j),j.castShadow&&P++),n.spotLightMatrix[p]=ce.matrix,j.castShadow){const re=t.get(j);re.shadowBias=ce.bias,re.shadowNormalBias=ce.normalBias,re.shadowRadius=ce.radius,re.shadowMapSize=ce.mapSize,n.spotShadow[p]=re,n.spotShadowMap[p]=se,m++}p++}else if(j.isRectAreaLight){const J=e.get(j);J.color.copy(K).multiplyScalar(ae),J.halfWidth.set(.5*j.width,0,0),J.halfHeight.set(0,.5*j.height,0),n.rectArea[v]=J,v++}else if(j.isPointLight){const J=e.get(j);if(J.color.copy(j.color).multiplyScalar(j.intensity),J.distance=j.distance,J.decay=j.decay,j.castShadow){const ce=j.shadow,re=t.get(j);re.shadowBias=ce.bias,re.shadowNormalBias=ce.normalBias,re.shadowRadius=ce.radius,re.shadowMapSize=ce.mapSize,re.shadowCameraNear=ce.camera.near,re.shadowCameraFar=ce.camera.far,n.pointShadow[d]=re,n.pointShadowMap[d]=se,n.pointShadowMatrix[d]=j.shadow.matrix,_++}n.point[d]=J,d++}else if(j.isHemisphereLight){const J=e.get(j);J.skyColor.copy(j.color).multiplyScalar(ae),J.groundColor.copy(j.groundColor).multiplyScalar(ae),n.hemi[x]=J,x++}}v>0&&(r.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=pe.LTC_FLOAT_1,n.rectAreaLTC2=pe.LTC_FLOAT_2):(n.rectAreaLTC1=pe.LTC_HALF_1,n.rectAreaLTC2=pe.LTC_HALF_2)),n.ambient[0]=l,n.ambient[1]=c,n.ambient[2]=u;const D=n.hash;D.directionalLength===h&&D.pointLength===d&&D.spotLength===p&&D.rectAreaLength===v&&D.hemiLength===x&&D.numDirectionalShadows===f&&D.numPointShadows===_&&D.numSpotShadows===m&&D.numSpotMaps===b&&D.numLightProbes===Y||(n.directional.length=h,n.spot.length=p,n.rectArea.length=v,n.point.length=d,n.hemi.length=x,n.directionalShadow.length=f,n.directionalShadowMap.length=f,n.pointShadow.length=_,n.pointShadowMap.length=_,n.spotShadow.length=m,n.spotShadowMap.length=m,n.directionalShadowMatrix.length=f,n.pointShadowMatrix.length=_,n.spotLightMatrix.length=m+b-P,n.spotLightMap.length=b,n.numSpotLightShadowsWithMaps=P,n.numLightProbes=Y,D.directionalLength=h,D.pointLength=d,D.spotLength=p,D.rectAreaLength=v,D.hemiLength=x,D.numDirectionalShadows=f,D.numPointShadows=_,D.numSpotShadows=m,D.numSpotMaps=b,D.numLightProbes=Y,n.version=Vh++)},setupView:function(o,l){let c=0,u=0,h=0,d=0,p=0;const v=l.matrixWorldInverse;for(let x=0,f=o.length;x<f;x++){const _=o[x];if(_.isDirectionalLight){const m=n.directional[c];m.direction.setFromMatrixPosition(_.matrixWorld),i.setFromMatrixPosition(_.target.matrixWorld),m.direction.sub(i),m.direction.transformDirection(v),c++}else if(_.isSpotLight){const m=n.spot[h];m.position.setFromMatrixPosition(_.matrixWorld),m.position.applyMatrix4(v),m.direction.setFromMatrixPosition(_.matrixWorld),i.setFromMatrixPosition(_.target.matrixWorld),m.direction.sub(i),m.direction.transformDirection(v),h++}else if(_.isRectAreaLight){const m=n.rectArea[d];m.position.setFromMatrixPosition(_.matrixWorld),m.position.applyMatrix4(v),s.identity(),a.copy(_.matrixWorld),a.premultiply(v),s.extractRotation(a),m.halfWidth.set(.5*_.width,0,0),m.halfHeight.set(0,.5*_.height,0),m.halfWidth.applyMatrix4(s),m.halfHeight.applyMatrix4(s),d++}else if(_.isPointLight){const m=n.point[u];m.position.setFromMatrixPosition(_.matrixWorld),m.position.applyMatrix4(v),u++}else if(_.isHemisphereLight){const m=n.hemi[p];m.direction.setFromMatrixPosition(_.matrixWorld),m.direction.transformDirection(v),p++}}},state:n}}function ll(r){const e=new Gh(r),t=[],n=[],i={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:function(a){i.camera=a,t.length=0,n.length=0},state:i,setupLights:function(){e.setup(t)},setupLightsView:function(a){e.setupView(t,a)},pushLight:function(a){t.push(a)},pushShadow:function(a){n.push(a)}}}function Wh(r){let e=new WeakMap;return{get:function(t,n=0){const i=e.get(t);let a;return i===void 0?(a=new ll(r),e.set(t,[a])):n>=i.length?(a=new ll(r),i.push(a)):a=i[n],a},dispose:function(){e=new WeakMap}}}class jh extends ln{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=3200,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Xh extends ln{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}function qh(r,e,t){let n=new ns;const i=new _e,a=new _e,s=new je,o=new jh({depthPacking:3201}),l=new Xh,c={},u=t.maxTextureSize,h={[xn]:Lt,[Lt]:xn,[xc]:2},d=new ht({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new _e},radius:{value:4}},vertexShader:`void main() {
	gl_Position = vec4( position, 1.0 );
}`,fragmentShader:`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`}),p=d.clone();p.defines.HORIZONTAL_PASS=1;const v=new Bt;v.setAttribute("position",new rt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const x=new at(v,d),f=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Qs;let _=this.type;function m(D,G){const X=e.update(x);d.defines.VSM_SAMPLES!==D.blurSamples&&(d.defines.VSM_SAMPLES=D.blurSamples,p.defines.VSM_SAMPLES=D.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),D.mapPass===null&&(D.mapPass=new Tt(i.x,i.y)),d.uniforms.shadow_pass.value=D.map.texture,d.uniforms.resolution.value=D.mapSize,d.uniforms.radius.value=D.radius,r.setRenderTarget(D.mapPass),r.clear(),r.renderBufferDirect(G,null,X,d,x,null),p.uniforms.shadow_pass.value=D.mapPass.texture,p.uniforms.resolution.value=D.mapSize,p.uniforms.radius.value=D.radius,r.setRenderTarget(D.map),r.clear(),r.renderBufferDirect(G,null,X,p,x,null)}function b(D,G,X,j){let K=null;const ae=X.isPointLight===!0?D.customDistanceMaterial:D.customDepthMaterial;if(ae!==void 0)K=ae;else if(K=X.isPointLight===!0?l:o,r.localClippingEnabled&&G.clipShadows===!0&&Array.isArray(G.clippingPlanes)&&G.clippingPlanes.length!==0||G.displacementMap&&G.displacementScale!==0||G.alphaMap&&G.alphaTest>0||G.map&&G.alphaTest>0){const $=K.uuid,se=G.uuid;let J=c[$];J===void 0&&(J={},c[$]=J);let ce=J[se];ce===void 0&&(ce=K.clone(),J[se]=ce,G.addEventListener("dispose",Y)),K=ce}return K.visible=G.visible,K.wireframe=G.wireframe,K.side=j===vn?G.shadowSide!==null?G.shadowSide:G.side:G.shadowSide!==null?G.shadowSide:h[G.side],K.alphaMap=G.alphaMap,K.alphaTest=G.alphaTest,K.map=G.map,K.clipShadows=G.clipShadows,K.clippingPlanes=G.clippingPlanes,K.clipIntersection=G.clipIntersection,K.displacementMap=G.displacementMap,K.displacementScale=G.displacementScale,K.displacementBias=G.displacementBias,K.wireframeLinewidth=G.wireframeLinewidth,K.linewidth=G.linewidth,X.isPointLight===!0&&K.isMeshDistanceMaterial===!0&&(r.properties.get(K).light=X),K}function P(D,G,X,j,K){if(D.visible===!1)return;if(D.layers.test(G.layers)&&(D.isMesh||D.isLine||D.isPoints)&&(D.castShadow||D.receiveShadow&&K===vn)&&(!D.frustumCulled||n.intersectsObject(D))){D.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,D.matrixWorld);const $=e.update(D),se=D.material;if(Array.isArray(se)){const J=$.groups;for(let ce=0,re=J.length;ce<re;ce++){const de=J[ce],E=se[de.materialIndex];if(E&&E.visible){const g=b(D,E,j,K);D.onBeforeShadow(r,D,G,X,$,g,de),r.renderBufferDirect(X,null,$,g,D,de),D.onAfterShadow(r,D,G,X,$,g,de)}}}else if(se.visible){const J=b(D,se,j,K);D.onBeforeShadow(r,D,G,X,$,J,null),r.renderBufferDirect(X,null,$,J,D,null),D.onAfterShadow(r,D,G,X,$,J,null)}}const ae=D.children;for(let $=0,se=ae.length;$<se;$++)P(ae[$],G,X,j,K)}function Y(D){D.target.removeEventListener("dispose",Y);for(const G in c){const X=c[G],j=D.target.uuid;j in X&&(X[j].dispose(),delete X[j])}}this.render=function(D,G,X){if(f.enabled===!1||f.autoUpdate===!1&&f.needsUpdate===!1||D.length===0)return;const j=r.getRenderTarget(),K=r.getActiveCubeFace(),ae=r.getActiveMipmapLevel(),$=r.state;$.setBlending(0),$.buffers.color.setClear(1,1,1,1),$.buffers.depth.setTest(!0),$.setScissorTest(!1);const se=_!==vn&&this.type===vn,J=_===vn&&this.type!==vn;for(let ce=0,re=D.length;ce<re;ce++){const de=D[ce],E=de.shadow;if(E===void 0||E.autoUpdate===!1&&E.needsUpdate===!1)continue;i.copy(E.mapSize);const g=E.getFrameExtents();if(i.multiply(g),a.copy(E.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(a.x=Math.floor(u/g.x),i.x=a.x*g.x,E.mapSize.x=a.x),i.y>u&&(a.y=Math.floor(u/g.y),i.y=a.y*g.y,E.mapSize.y=a.y)),E.map===null||se===!0||J===!0){const U=this.type!==vn?{minFilter:ut,magFilter:ut}:{};E.map!==null&&E.map.dispose(),E.map=new Tt(i.x,i.y,U),E.map.texture.name=de.name+".shadowMap",E.camera.updateProjectionMatrix()}r.setRenderTarget(E.map),r.clear();const T=E.getViewportCount();for(let U=0;U<T;U++){const C=E.getViewport(U);s.set(a.x*C.x,a.y*C.y,a.x*C.z,a.y*C.w),$.viewport(s),E.updateMatrices(de,U),n=E.getFrustum(),P(G,X,E.camera,de,this.type)}E.isPointLightShadow!==!0&&this.type===vn&&m(E,X),E.needsUpdate=!1}_=this.type,f.needsUpdate=!1,r.setRenderTarget(j,K,ae)}}function Yh(r){const e=new function(){let y=!1;const N=new je;let w=null;const V=new je(0,0,0,0);return{setMask:function(B){w===B||y||(r.colorMask(B,B,B,B),w=B)},setLocked:function(B){y=B},setClear:function(B,ne,oe,O,q){q===!0&&(B*=O,ne*=O,oe*=O),N.set(B,ne,oe,O),V.equals(N)===!1&&(r.clearColor(B,ne,oe,O),V.copy(N))},reset:function(){y=!1,w=null,V.set(-1,0,0,0)}}},t=new function(){let y=!1,N=null,w=null,V=null;return{setTest:function(B){B?W(r.DEPTH_TEST):k(r.DEPTH_TEST)},setMask:function(B){N===B||y||(r.depthMask(B),N=B)},setFunc:function(B){if(w!==B){switch(B){case 0:r.depthFunc(r.NEVER);break;case 1:r.depthFunc(r.ALWAYS);break;case 2:r.depthFunc(r.LESS);break;case 3:default:r.depthFunc(r.LEQUAL);break;case 4:r.depthFunc(r.EQUAL);break;case 5:r.depthFunc(r.GEQUAL);break;case 6:r.depthFunc(r.GREATER);break;case 7:r.depthFunc(r.NOTEQUAL)}w=B}},setLocked:function(B){y=B},setClear:function(B){V!==B&&(r.clearDepth(B),V=B)},reset:function(){y=!1,N=null,w=null,V=null}}},n=new function(){let y=!1,N=null,w=null,V=null,B=null,ne=null,oe=null,O=null,q=null;return{setTest:function(Q){y||(Q?W(r.STENCIL_TEST):k(r.STENCIL_TEST))},setMask:function(Q){N===Q||y||(r.stencilMask(Q),N=Q)},setFunc:function(Q,ue,me){w===Q&&V===ue&&B===me||(r.stencilFunc(Q,ue,me),w=Q,V=ue,B=me)},setOp:function(Q,ue,me){ne===Q&&oe===ue&&O===me||(r.stencilOp(Q,ue,me),ne=Q,oe=ue,O=me)},setLocked:function(Q){y=Q},setClear:function(Q){q!==Q&&(r.clearStencil(Q),q=Q)},reset:function(){y=!1,N=null,w=null,V=null,B=null,ne=null,oe=null,O=null,q=null}}},i=new WeakMap,a=new WeakMap;let s={},o={},l=new WeakMap,c=[],u=null,h=!1,d=null,p=null,v=null,x=null,f=null,_=null,m=null,b=new Se(0,0,0),P=0,Y=!1,D=null,G=null,X=null,j=null,K=null;const ae=r.getParameter(r.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let $=!1,se=0;const J=r.getParameter(r.VERSION);J.indexOf("WebGL")!==-1?(se=parseFloat(/^WebGL (\d)/.exec(J)[1]),$=se>=1):J.indexOf("OpenGL ES")!==-1&&(se=parseFloat(/^OpenGL ES (\d)/.exec(J)[1]),$=se>=2);let ce=null,re={};const de=r.getParameter(r.SCISSOR_BOX),E=r.getParameter(r.VIEWPORT),g=new je().fromArray(de),T=new je().fromArray(E);function U(y,N,w,V){const B=new Uint8Array(4),ne=r.createTexture();r.bindTexture(y,ne),r.texParameteri(y,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(y,r.TEXTURE_MAG_FILTER,r.NEAREST);for(let oe=0;oe<w;oe++)y===r.TEXTURE_3D||y===r.TEXTURE_2D_ARRAY?r.texImage3D(N,0,r.RGBA,1,1,V,0,r.RGBA,r.UNSIGNED_BYTE,B):r.texImage2D(N+oe,0,r.RGBA,1,1,0,r.RGBA,r.UNSIGNED_BYTE,B);return ne}const C={};function W(y){s[y]!==!0&&(r.enable(y),s[y]=!0)}function k(y){s[y]!==!1&&(r.disable(y),s[y]=!1)}C[r.TEXTURE_2D]=U(r.TEXTURE_2D,r.TEXTURE_2D,1),C[r.TEXTURE_CUBE_MAP]=U(r.TEXTURE_CUBE_MAP,r.TEXTURE_CUBE_MAP_POSITIVE_X,6),C[r.TEXTURE_2D_ARRAY]=U(r.TEXTURE_2D_ARRAY,r.TEXTURE_2D_ARRAY,1,1),C[r.TEXTURE_3D]=U(r.TEXTURE_3D,r.TEXTURE_3D,1,1),e.setClear(0,0,0,1),t.setClear(1),n.setClear(0),W(r.DEPTH_TEST),t.setFunc(3),R(!1),I(1),W(r.CULL_FACE),L(0);const M={[Gn]:r.FUNC_ADD,[_c]:r.FUNC_SUBTRACT,[yc]:r.FUNC_REVERSE_SUBTRACT};M[103]=r.MIN,M[104]=r.MAX;const S={[bc]:r.ZERO,[Sc]:r.ONE,[Mc]:r.SRC_COLOR,[wc]:r.SRC_ALPHA,[Lc]:r.SRC_ALPHA_SATURATE,[Cc]:r.DST_COLOR,[Ec]:r.DST_ALPHA,[Tc]:r.ONE_MINUS_SRC_COLOR,[Ac]:r.ONE_MINUS_SRC_ALPHA,[Pc]:r.ONE_MINUS_DST_COLOR,[Rc]:r.ONE_MINUS_DST_ALPHA,[Dc]:r.CONSTANT_COLOR,[Uc]:r.ONE_MINUS_CONSTANT_COLOR,[Ic]:r.CONSTANT_ALPHA,[Nc]:r.ONE_MINUS_CONSTANT_ALPHA};function L(y,N,w,V,B,ne,oe,O,q,Q){if(y!==0){if(h===!1&&(W(r.BLEND),h=!0),y===5)B=B||N,ne=ne||w,oe=oe||V,N===p&&B===f||(r.blendEquationSeparate(M[N],M[B]),p=N,f=B),w===v&&V===x&&ne===_&&oe===m||(r.blendFuncSeparate(S[w],S[V],S[ne],S[oe]),v=w,x=V,_=ne,m=oe),O.equals(b)!==!1&&q===P||(r.blendColor(O.r,O.g,O.b,q),b.copy(O),P=q),d=y,Y=!1;else if(y!==d||Q!==Y){if(p===Gn&&f===Gn||(r.blendEquation(r.FUNC_ADD),p=Gn,f=Gn),Q)switch(y){case 1:r.blendFuncSeparate(r.ONE,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case 2:r.blendFunc(r.ONE,r.ONE);break;case 3:r.blendFuncSeparate(r.ZERO,r.ONE_MINUS_SRC_COLOR,r.ZERO,r.ONE);break;case 4:r.blendFuncSeparate(r.ZERO,r.SRC_COLOR,r.ZERO,r.SRC_ALPHA)}else switch(y){case 1:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case 2:r.blendFunc(r.SRC_ALPHA,r.ONE);break;case 3:r.blendFuncSeparate(r.ZERO,r.ONE_MINUS_SRC_COLOR,r.ZERO,r.ONE);break;case 4:r.blendFunc(r.ZERO,r.SRC_COLOR)}v=null,x=null,_=null,m=null,b.set(0,0,0),P=0,d=y,Y=Q}}else h===!0&&(k(r.BLEND),h=!1)}function R(y){D!==y&&(y?r.frontFace(r.CW):r.frontFace(r.CCW),D=y)}function I(y){y!==0?(W(r.CULL_FACE),y!==G&&(y===1?r.cullFace(r.BACK):y===2?r.cullFace(r.FRONT):r.cullFace(r.FRONT_AND_BACK))):k(r.CULL_FACE),G=y}function F(y,N,w){y?(W(r.POLYGON_OFFSET_FILL),j===N&&K===w||(r.polygonOffset(N,w),j=N,K=w)):k(r.POLYGON_OFFSET_FILL)}return{buffers:{color:e,depth:t,stencil:n},enable:W,disable:k,bindFramebuffer:function(y,N){return o[y]!==N&&(r.bindFramebuffer(y,N),o[y]=N,y===r.DRAW_FRAMEBUFFER&&(o[r.FRAMEBUFFER]=N),y===r.FRAMEBUFFER&&(o[r.DRAW_FRAMEBUFFER]=N),!0)},drawBuffers:function(y,N){let w=c,V=!1;if(y){w=l.get(N),w===void 0&&(w=[],l.set(N,w));const B=y.textures;if(w.length!==B.length||w[0]!==r.COLOR_ATTACHMENT0){for(let ne=0,oe=B.length;ne<oe;ne++)w[ne]=r.COLOR_ATTACHMENT0+ne;w.length=B.length,V=!0}}else w[0]!==r.BACK&&(w[0]=r.BACK,V=!0);V&&r.drawBuffers(w)},useProgram:function(y){return u!==y&&(r.useProgram(y),u=y,!0)},setBlending:L,setMaterial:function(y,N){y.side===2?k(r.CULL_FACE):W(r.CULL_FACE);let w=y.side===Lt;N&&(w=!w),R(w),y.blending===1&&y.transparent===!1?L(0):L(y.blending,y.blendEquation,y.blendSrc,y.blendDst,y.blendEquationAlpha,y.blendSrcAlpha,y.blendDstAlpha,y.blendColor,y.blendAlpha,y.premultipliedAlpha),t.setFunc(y.depthFunc),t.setTest(y.depthTest),t.setMask(y.depthWrite),e.setMask(y.colorWrite);const V=y.stencilWrite;n.setTest(V),V&&(n.setMask(y.stencilWriteMask),n.setFunc(y.stencilFunc,y.stencilRef,y.stencilFuncMask),n.setOp(y.stencilFail,y.stencilZFail,y.stencilZPass)),F(y.polygonOffset,y.polygonOffsetFactor,y.polygonOffsetUnits),y.alphaToCoverage===!0?W(r.SAMPLE_ALPHA_TO_COVERAGE):k(r.SAMPLE_ALPHA_TO_COVERAGE)},setFlipSided:R,setCullFace:I,setLineWidth:function(y){y!==X&&($&&r.lineWidth(y),X=y)},setPolygonOffset:F,setScissorTest:function(y){y?W(r.SCISSOR_TEST):k(r.SCISSOR_TEST)},activeTexture:function(y){y===void 0&&(y=r.TEXTURE0+ae-1),ce!==y&&(r.activeTexture(y),ce=y)},bindTexture:function(y,N,w){w===void 0&&(w=ce===null?r.TEXTURE0+ae-1:ce);let V=re[w];V===void 0&&(V={type:void 0,texture:void 0},re[w]=V),V.type===y&&V.texture===N||(ce!==w&&(r.activeTexture(w),ce=w),r.bindTexture(y,N||C[y]),V.type=y,V.texture=N)},unbindTexture:function(){const y=re[ce];y!==void 0&&y.type!==void 0&&(r.bindTexture(y.type,null),y.type=void 0,y.texture=void 0)},compressedTexImage2D:function(){try{r.compressedTexImage2D.apply(r,arguments)}catch{}},compressedTexImage3D:function(){try{r.compressedTexImage3D.apply(r,arguments)}catch{}},texImage2D:function(){try{r.texImage2D.apply(r,arguments)}catch{}},texImage3D:function(){try{r.texImage3D.apply(r,arguments)}catch{}},updateUBOMapping:function(y,N){let w=a.get(N);w===void 0&&(w=new WeakMap,a.set(N,w));let V=w.get(y);V===void 0&&(V=r.getUniformBlockIndex(N,y.name),w.set(y,V))},uniformBlockBinding:function(y,N){const w=a.get(N).get(y);i.get(N)!==w&&(r.uniformBlockBinding(N,w,y.__bindingPointIndex),i.set(N,w))},texStorage2D:function(){try{r.texStorage2D.apply(r,arguments)}catch{}},texStorage3D:function(){try{r.texStorage3D.apply(r,arguments)}catch{}},texSubImage2D:function(){try{r.texSubImage2D.apply(r,arguments)}catch{}},texSubImage3D:function(){try{r.texSubImage3D.apply(r,arguments)}catch{}},compressedTexSubImage2D:function(){try{r.compressedTexSubImage2D.apply(r,arguments)}catch{}},compressedTexSubImage3D:function(){try{r.compressedTexSubImage3D.apply(r,arguments)}catch{}},scissor:function(y){g.equals(y)===!1&&(r.scissor(y.x,y.y,y.z,y.w),g.copy(y))},viewport:function(y){T.equals(y)===!1&&(r.viewport(y.x,y.y,y.z,y.w),T.copy(y))},reset:function(){r.disable(r.BLEND),r.disable(r.CULL_FACE),r.disable(r.DEPTH_TEST),r.disable(r.POLYGON_OFFSET_FILL),r.disable(r.SCISSOR_TEST),r.disable(r.STENCIL_TEST),r.disable(r.SAMPLE_ALPHA_TO_COVERAGE),r.blendEquation(r.FUNC_ADD),r.blendFunc(r.ONE,r.ZERO),r.blendFuncSeparate(r.ONE,r.ZERO,r.ONE,r.ZERO),r.blendColor(0,0,0,0),r.colorMask(!0,!0,!0,!0),r.clearColor(0,0,0,0),r.depthMask(!0),r.depthFunc(r.LESS),r.clearDepth(1),r.stencilMask(4294967295),r.stencilFunc(r.ALWAYS,0,4294967295),r.stencilOp(r.KEEP,r.KEEP,r.KEEP),r.clearStencil(0),r.cullFace(r.BACK),r.frontFace(r.CCW),r.polygonOffset(0,0),r.activeTexture(r.TEXTURE0),r.bindFramebuffer(r.FRAMEBUFFER,null),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),r.bindFramebuffer(r.READ_FRAMEBUFFER,null),r.useProgram(null),r.lineWidth(1),r.scissor(0,0,r.canvas.width,r.canvas.height),r.viewport(0,0,r.canvas.width,r.canvas.height),s={},ce=null,re={},o={},l=new WeakMap,c=[],u=null,h=!1,d=null,p=null,v=null,x=null,f=null,_=null,m=null,b=new Se(0,0,0),P=0,Y=!1,D=null,G=null,X=null,j=null,K=null,g.set(0,0,r.canvas.width,r.canvas.height),T.set(0,0,r.canvas.width,r.canvas.height),e.reset(),t.reset(),n.reset()}}}function Kh(r,e,t,n,i,a,s){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator<"u"&&/OculusBrowser/g.test(navigator.userAgent),c=new _e,u=new WeakMap;let h;const d=new WeakMap;let p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function v(M,S){return p?new OffscreenCanvas(M,S):ir("canvas")}function x(M,S,L){let R=1;const I=k(M);if((I.width>L||I.height>L)&&(R=L/Math.max(I.width,I.height)),R<1){if(typeof HTMLImageElement<"u"&&M instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&M instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&M instanceof ImageBitmap||typeof VideoFrame<"u"&&M instanceof VideoFrame){const F=Math.floor(R*I.width),y=Math.floor(R*I.height);h===void 0&&(h=v(F,y));const N=S?v(F,y):h;return N.width=F,N.height=y,N.getContext("2d").drawImage(M,0,0,F,y),N}return M}return M}function f(M){return M.generateMipmaps&&M.minFilter!==ut&&M.minFilter!==Ut}function _(M){r.generateMipmap(M)}function m(M,S,L,R,I=!1){if(M!==null&&r[M]!==void 0)return r[M];let F=S;if(S===r.RED&&(L===r.FLOAT&&(F=r.R32F),L===r.HALF_FLOAT&&(F=r.R16F),L===r.UNSIGNED_BYTE&&(F=r.R8)),S===r.RED_INTEGER&&(L===r.UNSIGNED_BYTE&&(F=r.R8UI),L===r.UNSIGNED_SHORT&&(F=r.R16UI),L===r.UNSIGNED_INT&&(F=r.R32UI),L===r.BYTE&&(F=r.R8I),L===r.SHORT&&(F=r.R16I),L===r.INT&&(F=r.R32I)),S===r.RG&&(L===r.FLOAT&&(F=r.RG32F),L===r.HALF_FLOAT&&(F=r.RG16F),L===r.UNSIGNED_BYTE&&(F=r.RG8)),S===r.RG_INTEGER&&(L===r.UNSIGNED_BYTE&&(F=r.RG8UI),L===r.UNSIGNED_SHORT&&(F=r.RG16UI),L===r.UNSIGNED_INT&&(F=r.RG32UI),L===r.BYTE&&(F=r.RG8I),L===r.SHORT&&(F=r.RG16I),L===r.INT&&(F=r.RG32I)),S===r.RGB&&L===r.UNSIGNED_INT_5_9_9_9_REV&&(F=r.RGB9_E5),S===r.RGBA){const y=I?Nr:Ve.getTransfer(R);L===r.FLOAT&&(F=r.RGBA32F),L===r.HALF_FLOAT&&(F=r.RGBA16F),L===r.UNSIGNED_BYTE&&(F=y===Ze?r.SRGB8_ALPHA8:r.RGBA8),L===r.UNSIGNED_SHORT_4_4_4_4&&(F=r.RGBA4),L===r.UNSIGNED_SHORT_5_5_5_1&&(F=r.RGB5_A1)}return F!==r.R16F&&F!==r.R32F&&F!==r.RG16F&&F!==r.RG32F&&F!==r.RGBA16F&&F!==r.RGBA32F||e.get("EXT_color_buffer_float"),F}function b(M,S){let L;return M?S===null||S===hi||S===di?L=r.DEPTH24_STENCIL8:S===It?L=r.DEPTH32F_STENCIL8:S===Dr&&(L=r.DEPTH24_STENCIL8):S===null||S===hi||S===di?L=r.DEPTH_COMPONENT24:S===It?L=r.DEPTH_COMPONENT32F:S===Dr&&(L=r.DEPTH_COMPONENT16),L}function P(M,S){return f(M)===!0||M.isFramebufferTexture&&M.minFilter!==ut&&M.minFilter!==Ut?Math.log2(Math.max(S.width,S.height))+1:M.mipmaps!==void 0&&M.mipmaps.length>0?M.mipmaps.length:M.isCompressedTexture&&Array.isArray(M.image)?S.mipmaps.length:1}function Y(M){const S=M.target;S.removeEventListener("dispose",Y),function(L){const R=n.get(L);if(R.__webglInit===void 0)return;const I=L.source,F=d.get(I);if(F){const y=F[R.__cacheKey];y.usedTimes--,y.usedTimes===0&&G(L),Object.keys(F).length===0&&d.delete(I)}n.remove(L)}(S),S.isVideoTexture&&u.delete(S)}function D(M){const S=M.target;S.removeEventListener("dispose",D),function(L){const R=n.get(L);if(L.depthTexture&&L.depthTexture.dispose(),L.isWebGLCubeRenderTarget)for(let F=0;F<6;F++){if(Array.isArray(R.__webglFramebuffer[F]))for(let y=0;y<R.__webglFramebuffer[F].length;y++)r.deleteFramebuffer(R.__webglFramebuffer[F][y]);else r.deleteFramebuffer(R.__webglFramebuffer[F]);R.__webglDepthbuffer&&r.deleteRenderbuffer(R.__webglDepthbuffer[F])}else{if(Array.isArray(R.__webglFramebuffer))for(let F=0;F<R.__webglFramebuffer.length;F++)r.deleteFramebuffer(R.__webglFramebuffer[F]);else r.deleteFramebuffer(R.__webglFramebuffer);if(R.__webglDepthbuffer&&r.deleteRenderbuffer(R.__webglDepthbuffer),R.__webglMultisampledFramebuffer&&r.deleteFramebuffer(R.__webglMultisampledFramebuffer),R.__webglColorRenderbuffer)for(let F=0;F<R.__webglColorRenderbuffer.length;F++)R.__webglColorRenderbuffer[F]&&r.deleteRenderbuffer(R.__webglColorRenderbuffer[F]);R.__webglDepthRenderbuffer&&r.deleteRenderbuffer(R.__webglDepthRenderbuffer)}const I=L.textures;for(let F=0,y=I.length;F<y;F++){const N=n.get(I[F]);N.__webglTexture&&(r.deleteTexture(N.__webglTexture),s.memory.textures--),n.remove(I[F])}n.remove(L)}(S)}function G(M){const S=n.get(M);r.deleteTexture(S.__webglTexture);const L=M.source;delete d.get(L)[S.__cacheKey],s.memory.textures--}let X=0;function j(M,S){const L=n.get(M);if(M.isVideoTexture&&function(R){const I=s.render.frame;u.get(R)!==I&&(u.set(R,I),R.update())}(M),M.isRenderTargetTexture===!1&&M.version>0&&L.__version!==M.version){const R=M.image;if(R!==null){if(R.complete!==!1)return void ce(L,M,S)}}t.bindTexture(r.TEXTURE_2D,L.__webglTexture,r.TEXTURE0+S)}const K={[ci]:r.REPEAT,[Cn]:r.CLAMP_TO_EDGE,[Pr]:r.MIRRORED_REPEAT},ae={[ut]:r.NEAREST,[jc]:r.NEAREST_MIPMAP_NEAREST,[Ji]:r.NEAREST_MIPMAP_LINEAR,[Ut]:r.LINEAR,[Lr]:r.LINEAR_MIPMAP_NEAREST,[Wn]:r.LINEAR_MIPMAP_LINEAR},$={[Xc]:r.NEVER,[$c]:r.ALWAYS,[qc]:r.LESS,[Kc]:r.LEQUAL,[Yc]:r.EQUAL,[Qc]:r.GEQUAL,[Zc]:r.GREATER,[Jc]:r.NOTEQUAL};function se(M,S){if(S.type===It&&e.has("OES_texture_float_linear")===!1&&(S.magFilter===Ut||S.magFilter===Lr||S.magFilter===Ji||S.magFilter===Wn||S.minFilter===Ut||S.minFilter===Lr||S.minFilter===Ji||S.minFilter),r.texParameteri(M,r.TEXTURE_WRAP_S,K[S.wrapS]),r.texParameteri(M,r.TEXTURE_WRAP_T,K[S.wrapT]),M!==r.TEXTURE_3D&&M!==r.TEXTURE_2D_ARRAY||r.texParameteri(M,r.TEXTURE_WRAP_R,K[S.wrapR]),r.texParameteri(M,r.TEXTURE_MAG_FILTER,ae[S.magFilter]),r.texParameteri(M,r.TEXTURE_MIN_FILTER,ae[S.minFilter]),S.compareFunction&&(r.texParameteri(M,r.TEXTURE_COMPARE_MODE,r.COMPARE_REF_TO_TEXTURE),r.texParameteri(M,r.TEXTURE_COMPARE_FUNC,$[S.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(S.magFilter===ut||S.minFilter!==Ji&&S.minFilter!==Wn||S.type===It&&e.has("OES_texture_float_linear")===!1)return;if(S.anisotropy>1||n.get(S).__currentAnisotropy){const L=e.get("EXT_texture_filter_anisotropic");r.texParameterf(M,L.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(S.anisotropy,i.getMaxAnisotropy())),n.get(S).__currentAnisotropy=S.anisotropy}}}function J(M,S){let L=!1;M.__webglInit===void 0&&(M.__webglInit=!0,S.addEventListener("dispose",Y));const R=S.source;let I=d.get(R);I===void 0&&(I={},d.set(R,I));const F=function(y){const N=[];return N.push(y.wrapS),N.push(y.wrapT),N.push(y.wrapR||0),N.push(y.magFilter),N.push(y.minFilter),N.push(y.anisotropy),N.push(y.internalFormat),N.push(y.format),N.push(y.type),N.push(y.generateMipmaps),N.push(y.premultiplyAlpha),N.push(y.flipY),N.push(y.unpackAlignment),N.push(y.colorSpace),N.join()}(S);if(F!==M.__cacheKey){I[F]===void 0&&(I[F]={texture:r.createTexture(),usedTimes:0},s.memory.textures++,L=!0),I[F].usedTimes++;const y=I[M.__cacheKey];y!==void 0&&(I[M.__cacheKey].usedTimes--,y.usedTimes===0&&G(S)),M.__cacheKey=F,M.__webglTexture=I[F].texture}return L}function ce(M,S,L){let R=r.TEXTURE_2D;(S.isDataArrayTexture||S.isCompressedArrayTexture)&&(R=r.TEXTURE_2D_ARRAY),S.isData3DTexture&&(R=r.TEXTURE_3D);const I=J(M,S),F=S.source;t.bindTexture(R,M.__webglTexture,r.TEXTURE0+L);const y=n.get(F);if(F.version!==y.__version||I===!0){t.activeTexture(r.TEXTURE0+L);const N=Ve.getPrimaries(Ve.workingColorSpace),w=S.colorSpace===fi?null:Ve.getPrimaries(S.colorSpace),V=S.colorSpace===fi||N===w?r.NONE:r.BROWSER_DEFAULT_WEBGL;r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,S.flipY),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),r.pixelStorei(r.UNPACK_ALIGNMENT,S.unpackAlignment),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,V);let B=x(S.image,!1,i.maxTextureSize);B=W(S,B);const ne=a.convert(S.format,S.colorSpace),oe=a.convert(S.type);let O,q=m(S.internalFormat,ne,oe,S.colorSpace,S.isVideoTexture);se(R,S);const Q=S.mipmaps,ue=S.isVideoTexture!==!0,me=y.__version===void 0||I===!0,Ae=F.dataReady,Re=P(S,B);if(S.isDepthTexture)q=b(S.format===pi,S.type),me&&(ue?t.texStorage2D(r.TEXTURE_2D,1,q,B.width,B.height):t.texImage2D(r.TEXTURE_2D,0,q,B.width,B.height,0,ne,oe,null));else if(S.isDataTexture)if(Q.length>0){ue&&me&&t.texStorage2D(r.TEXTURE_2D,Re,q,Q[0].width,Q[0].height);for(let fe=0,we=Q.length;fe<we;fe++)O=Q[fe],ue?Ae&&t.texSubImage2D(r.TEXTURE_2D,fe,0,0,O.width,O.height,ne,oe,O.data):t.texImage2D(r.TEXTURE_2D,fe,q,O.width,O.height,0,ne,oe,O.data);S.generateMipmaps=!1}else ue?(me&&t.texStorage2D(r.TEXTURE_2D,Re,q,B.width,B.height),Ae&&t.texSubImage2D(r.TEXTURE_2D,0,0,0,B.width,B.height,ne,oe,B.data)):t.texImage2D(r.TEXTURE_2D,0,q,B.width,B.height,0,ne,oe,B.data);else if(S.isCompressedTexture)if(S.isCompressedArrayTexture){ue&&me&&t.texStorage3D(r.TEXTURE_2D_ARRAY,Re,q,Q[0].width,Q[0].height,B.depth);for(let fe=0,we=Q.length;fe<we;fe++)if(O=Q[fe],S.format!==qt){if(ne!==null)if(ue){if(Ae)if(S.layerUpdates.size>0){for(const ge of S.layerUpdates){const We=O.width*O.height;t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,fe,0,0,ge,O.width,O.height,1,ne,O.data.slice(We*ge,We*(ge+1)),0,0)}S.clearLayerUpdates()}else t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,fe,0,0,0,O.width,O.height,B.depth,ne,O.data,0,0)}else t.compressedTexImage3D(r.TEXTURE_2D_ARRAY,fe,q,O.width,O.height,B.depth,0,O.data,0,0)}else ue?Ae&&t.texSubImage3D(r.TEXTURE_2D_ARRAY,fe,0,0,0,O.width,O.height,B.depth,ne,oe,O.data):t.texImage3D(r.TEXTURE_2D_ARRAY,fe,q,O.width,O.height,B.depth,0,ne,oe,O.data)}else{ue&&me&&t.texStorage2D(r.TEXTURE_2D,Re,q,Q[0].width,Q[0].height);for(let fe=0,we=Q.length;fe<we;fe++)O=Q[fe],S.format!==qt?ne!==null&&(ue?Ae&&t.compressedTexSubImage2D(r.TEXTURE_2D,fe,0,0,O.width,O.height,ne,O.data):t.compressedTexImage2D(r.TEXTURE_2D,fe,q,O.width,O.height,0,O.data)):ue?Ae&&t.texSubImage2D(r.TEXTURE_2D,fe,0,0,O.width,O.height,ne,oe,O.data):t.texImage2D(r.TEXTURE_2D,fe,q,O.width,O.height,0,ne,oe,O.data)}else if(S.isDataArrayTexture)if(ue){if(me&&t.texStorage3D(r.TEXTURE_2D_ARRAY,Re,q,B.width,B.height,B.depth),Ae)if(S.layerUpdates.size>0){let fe;switch(oe){case r.UNSIGNED_BYTE:switch(ne){case r.ALPHA:case r.LUMINANCE:fe=1;break;case r.LUMINANCE_ALPHA:fe=2;break;case r.RGB:fe=3;break;case r.RGBA:fe=4;break;default:throw new Error(`Unknown texel size for format ${ne}.`)}break;case r.UNSIGNED_SHORT_4_4_4_4:case r.UNSIGNED_SHORT_5_5_5_1:case r.UNSIGNED_SHORT_5_6_5:fe=1;break;default:throw new Error(`Unknown texel size for type ${oe}.`)}const we=B.width*B.height*fe;for(const ge of S.layerUpdates)t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,ge,B.width,B.height,1,ne,oe,B.data.slice(we*ge,we*(ge+1)));S.clearLayerUpdates()}else t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,0,B.width,B.height,B.depth,ne,oe,B.data)}else t.texImage3D(r.TEXTURE_2D_ARRAY,0,q,B.width,B.height,B.depth,0,ne,oe,B.data);else if(S.isData3DTexture)ue?(me&&t.texStorage3D(r.TEXTURE_3D,Re,q,B.width,B.height,B.depth),Ae&&t.texSubImage3D(r.TEXTURE_3D,0,0,0,0,B.width,B.height,B.depth,ne,oe,B.data)):t.texImage3D(r.TEXTURE_3D,0,q,B.width,B.height,B.depth,0,ne,oe,B.data);else if(S.isFramebufferTexture){if(me)if(ue)t.texStorage2D(r.TEXTURE_2D,Re,q,B.width,B.height);else{let fe=B.width,we=B.height;for(let ge=0;ge<Re;ge++)t.texImage2D(r.TEXTURE_2D,ge,q,fe,we,0,ne,oe,null),fe>>=1,we>>=1}}else if(Q.length>0){if(ue&&me){const fe=k(Q[0]);t.texStorage2D(r.TEXTURE_2D,Re,q,fe.width,fe.height)}for(let fe=0,we=Q.length;fe<we;fe++)O=Q[fe],ue?Ae&&t.texSubImage2D(r.TEXTURE_2D,fe,0,0,ne,oe,O):t.texImage2D(r.TEXTURE_2D,fe,q,ne,oe,O);S.generateMipmaps=!1}else if(ue){if(me){const fe=k(B);t.texStorage2D(r.TEXTURE_2D,Re,q,fe.width,fe.height)}Ae&&t.texSubImage2D(r.TEXTURE_2D,0,0,0,ne,oe,B)}else t.texImage2D(r.TEXTURE_2D,0,q,ne,oe,B);f(S)&&_(R),y.__version=F.version,S.onUpdate&&S.onUpdate(S)}M.__version=S.version}function re(M,S,L,R,I,F){const y=a.convert(L.format,L.colorSpace),N=a.convert(L.type),w=m(L.internalFormat,y,N,L.colorSpace);if(!n.get(S).__hasExternalTextures){const V=Math.max(1,S.width>>F),B=Math.max(1,S.height>>F);I===r.TEXTURE_3D||I===r.TEXTURE_2D_ARRAY?t.texImage3D(I,F,w,V,B,S.depth,0,y,N,null):t.texImage2D(I,F,w,V,B,0,y,N,null)}t.bindFramebuffer(r.FRAMEBUFFER,M),C(S)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,R,I,n.get(L).__webglTexture,0,U(S)):(I===r.TEXTURE_2D||I>=r.TEXTURE_CUBE_MAP_POSITIVE_X&&I<=r.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&r.framebufferTexture2D(r.FRAMEBUFFER,R,I,n.get(L).__webglTexture,F),t.bindFramebuffer(r.FRAMEBUFFER,null)}function de(M,S,L){if(r.bindRenderbuffer(r.RENDERBUFFER,M),S.depthBuffer){const R=S.depthTexture,I=R&&R.isDepthTexture?R.type:null,F=b(S.stencilBuffer,I),y=S.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,N=U(S);C(S)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,N,F,S.width,S.height):L?r.renderbufferStorageMultisample(r.RENDERBUFFER,N,F,S.width,S.height):r.renderbufferStorage(r.RENDERBUFFER,F,S.width,S.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,y,r.RENDERBUFFER,M)}else{const R=S.textures;for(let I=0;I<R.length;I++){const F=R[I],y=a.convert(F.format,F.colorSpace),N=a.convert(F.type),w=m(F.internalFormat,y,N,F.colorSpace),V=U(S);L&&C(S)===!1?r.renderbufferStorageMultisample(r.RENDERBUFFER,V,w,S.width,S.height):C(S)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,V,w,S.width,S.height):r.renderbufferStorage(r.RENDERBUFFER,w,S.width,S.height)}}r.bindRenderbuffer(r.RENDERBUFFER,null)}function E(M){const S=n.get(M),L=M.isWebGLCubeRenderTarget===!0;if(M.depthTexture&&!S.__autoAllocateDepthBuffer){if(L)throw new Error("target.depthTexture not supported in Cube render targets");(function(R,I){if(I&&I.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(r.FRAMEBUFFER,R),!I.depthTexture||!I.depthTexture.isDepthTexture)throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");n.get(I.depthTexture).__webglTexture&&I.depthTexture.image.width===I.width&&I.depthTexture.image.height===I.height||(I.depthTexture.image.width=I.width,I.depthTexture.image.height=I.height,I.depthTexture.needsUpdate=!0),j(I.depthTexture,0);const F=n.get(I.depthTexture).__webglTexture,y=U(I);if(I.depthTexture.format===Qi)C(I)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,F,0,y):r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.TEXTURE_2D,F,0);else{if(I.depthTexture.format!==pi)throw new Error("Unknown depthTexture format");C(I)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,r.DEPTH_STENCIL_ATTACHMENT,r.TEXTURE_2D,F,0,y):r.framebufferTexture2D(r.FRAMEBUFFER,r.DEPTH_STENCIL_ATTACHMENT,r.TEXTURE_2D,F,0)}})(S.__webglFramebuffer,M)}else if(L){S.__webglDepthbuffer=[];for(let R=0;R<6;R++)t.bindFramebuffer(r.FRAMEBUFFER,S.__webglFramebuffer[R]),S.__webglDepthbuffer[R]=r.createRenderbuffer(),de(S.__webglDepthbuffer[R],M,!1)}else t.bindFramebuffer(r.FRAMEBUFFER,S.__webglFramebuffer),S.__webglDepthbuffer=r.createRenderbuffer(),de(S.__webglDepthbuffer,M,!1);t.bindFramebuffer(r.FRAMEBUFFER,null)}const g=[],T=[];function U(M){return Math.min(i.maxSamples,M.samples)}function C(M){const S=n.get(M);return M.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&S.__useRenderToTexture!==!1}function W(M,S){const L=M.colorSpace;return M.format,M.type,M.isCompressedTexture===!0||M.isVideoTexture===!0||L!==yt&&L!==fi&&Ve.getTransfer(L),S}function k(M){return typeof HTMLImageElement<"u"&&M instanceof HTMLImageElement?(c.width=M.naturalWidth||M.width,c.height=M.naturalHeight||M.height):typeof VideoFrame<"u"&&M instanceof VideoFrame?(c.width=M.displayWidth,c.height=M.displayHeight):(c.width=M.width,c.height=M.height),c}this.allocateTextureUnit=function(){const M=X;return i.maxTextures,X+=1,M},this.resetTextureUnits=function(){X=0},this.setTexture2D=j,this.setTexture2DArray=function(M,S){const L=n.get(M);M.version>0&&L.__version!==M.version?ce(L,M,S):t.bindTexture(r.TEXTURE_2D_ARRAY,L.__webglTexture,r.TEXTURE0+S)},this.setTexture3D=function(M,S){const L=n.get(M);M.version>0&&L.__version!==M.version?ce(L,M,S):t.bindTexture(r.TEXTURE_3D,L.__webglTexture,r.TEXTURE0+S)},this.setTextureCube=function(M,S){const L=n.get(M);M.version>0&&L.__version!==M.version?function(R,I,F){if(I.image.length!==6)return;const y=J(R,I),N=I.source;t.bindTexture(r.TEXTURE_CUBE_MAP,R.__webglTexture,r.TEXTURE0+F);const w=n.get(N);if(N.version!==w.__version||y===!0){t.activeTexture(r.TEXTURE0+F);const V=Ve.getPrimaries(Ve.workingColorSpace),B=I.colorSpace===fi?null:Ve.getPrimaries(I.colorSpace),ne=I.colorSpace===fi||V===B?r.NONE:r.BROWSER_DEFAULT_WEBGL;r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,I.flipY),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,I.premultiplyAlpha),r.pixelStorei(r.UNPACK_ALIGNMENT,I.unpackAlignment),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,ne);const oe=I.isCompressedTexture||I.image[0].isCompressedTexture,O=I.image[0]&&I.image[0].isDataTexture,q=[];for(let ve=0;ve<6;ve++)q[ve]=oe||O?O?I.image[ve].image:I.image[ve]:x(I.image[ve],!0,i.maxCubemapSize),q[ve]=W(I,q[ve]);const Q=q[0],ue=a.convert(I.format,I.colorSpace),me=a.convert(I.type),Ae=m(I.internalFormat,ue,me,I.colorSpace),Re=I.isVideoTexture!==!0,fe=w.__version===void 0||y===!0,we=N.dataReady;let ge,We=P(I,Q);if(se(r.TEXTURE_CUBE_MAP,I),oe){Re&&fe&&t.texStorage2D(r.TEXTURE_CUBE_MAP,We,Ae,Q.width,Q.height);for(let ve=0;ve<6;ve++){ge=q[ve].mipmaps;for(let Te=0;Te<ge.length;Te++){const be=ge[Te];I.format!==qt?ue!==null&&(Re?we&&t.compressedTexSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te,0,0,be.width,be.height,ue,be.data):t.compressedTexImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te,Ae,be.width,be.height,0,be.data)):Re?we&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te,0,0,be.width,be.height,ue,me,be.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te,Ae,be.width,be.height,0,ue,me,be.data)}}}else{if(ge=I.mipmaps,Re&&fe){ge.length>0&&We++;const ve=k(q[0]);t.texStorage2D(r.TEXTURE_CUBE_MAP,We,Ae,ve.width,ve.height)}for(let ve=0;ve<6;ve++)if(O){Re?we&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,0,0,0,q[ve].width,q[ve].height,ue,me,q[ve].data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,0,Ae,q[ve].width,q[ve].height,0,ue,me,q[ve].data);for(let Te=0;Te<ge.length;Te++){const be=ge[Te].image[ve].image;Re?we&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te+1,0,0,be.width,be.height,ue,me,be.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te+1,Ae,be.width,be.height,0,ue,me,be.data)}}else{Re?we&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,0,0,0,ue,me,q[ve]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,0,Ae,ue,me,q[ve]);for(let Te=0;Te<ge.length;Te++){const be=ge[Te];Re?we&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te+1,0,0,ue,me,be.image[ve]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ve,Te+1,Ae,ue,me,be.image[ve])}}}f(I)&&_(r.TEXTURE_CUBE_MAP),w.__version=N.version,I.onUpdate&&I.onUpdate(I)}R.__version=I.version}(L,M,S):t.bindTexture(r.TEXTURE_CUBE_MAP,L.__webglTexture,r.TEXTURE0+S)},this.rebindTextures=function(M,S,L){const R=n.get(M);S!==void 0&&re(R.__webglFramebuffer,M,M.texture,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,0),L!==void 0&&E(M)},this.setupRenderTarget=function(M){const S=M.texture,L=n.get(M),R=n.get(S);M.addEventListener("dispose",D);const I=M.textures,F=M.isWebGLCubeRenderTarget===!0,y=I.length>1;if(y||(R.__webglTexture===void 0&&(R.__webglTexture=r.createTexture()),R.__version=S.version,s.memory.textures++),F){L.__webglFramebuffer=[];for(let N=0;N<6;N++)if(S.mipmaps&&S.mipmaps.length>0){L.__webglFramebuffer[N]=[];for(let w=0;w<S.mipmaps.length;w++)L.__webglFramebuffer[N][w]=r.createFramebuffer()}else L.__webglFramebuffer[N]=r.createFramebuffer()}else{if(S.mipmaps&&S.mipmaps.length>0){L.__webglFramebuffer=[];for(let N=0;N<S.mipmaps.length;N++)L.__webglFramebuffer[N]=r.createFramebuffer()}else L.__webglFramebuffer=r.createFramebuffer();if(y)for(let N=0,w=I.length;N<w;N++){const V=n.get(I[N]);V.__webglTexture===void 0&&(V.__webglTexture=r.createTexture(),s.memory.textures++)}if(M.samples>0&&C(M)===!1){L.__webglMultisampledFramebuffer=r.createFramebuffer(),L.__webglColorRenderbuffer=[],t.bindFramebuffer(r.FRAMEBUFFER,L.__webglMultisampledFramebuffer);for(let N=0;N<I.length;N++){const w=I[N];L.__webglColorRenderbuffer[N]=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,L.__webglColorRenderbuffer[N]);const V=a.convert(w.format,w.colorSpace),B=a.convert(w.type),ne=m(w.internalFormat,V,B,w.colorSpace,M.isXRRenderTarget===!0),oe=U(M);r.renderbufferStorageMultisample(r.RENDERBUFFER,oe,ne,M.width,M.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+N,r.RENDERBUFFER,L.__webglColorRenderbuffer[N])}r.bindRenderbuffer(r.RENDERBUFFER,null),M.depthBuffer&&(L.__webglDepthRenderbuffer=r.createRenderbuffer(),de(L.__webglDepthRenderbuffer,M,!0)),t.bindFramebuffer(r.FRAMEBUFFER,null)}}if(F){t.bindTexture(r.TEXTURE_CUBE_MAP,R.__webglTexture),se(r.TEXTURE_CUBE_MAP,S);for(let N=0;N<6;N++)if(S.mipmaps&&S.mipmaps.length>0)for(let w=0;w<S.mipmaps.length;w++)re(L.__webglFramebuffer[N][w],M,S,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+N,w);else re(L.__webglFramebuffer[N],M,S,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+N,0);f(S)&&_(r.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(y){for(let N=0,w=I.length;N<w;N++){const V=I[N],B=n.get(V);t.bindTexture(r.TEXTURE_2D,B.__webglTexture),se(r.TEXTURE_2D,V),re(L.__webglFramebuffer,M,V,r.COLOR_ATTACHMENT0+N,r.TEXTURE_2D,0),f(V)&&_(r.TEXTURE_2D)}t.unbindTexture()}else{let N=r.TEXTURE_2D;if((M.isWebGL3DRenderTarget||M.isWebGLArrayRenderTarget)&&(N=M.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),t.bindTexture(N,R.__webglTexture),se(N,S),S.mipmaps&&S.mipmaps.length>0)for(let w=0;w<S.mipmaps.length;w++)re(L.__webglFramebuffer[w],M,S,r.COLOR_ATTACHMENT0,N,w);else re(L.__webglFramebuffer,M,S,r.COLOR_ATTACHMENT0,N,0);f(S)&&_(N),t.unbindTexture()}M.depthBuffer&&E(M)},this.updateRenderTargetMipmap=function(M){const S=M.textures;for(let L=0,R=S.length;L<R;L++){const I=S[L];if(f(I)){const F=M.isWebGLCubeRenderTarget?r.TEXTURE_CUBE_MAP:r.TEXTURE_2D,y=n.get(I).__webglTexture;t.bindTexture(F,y),_(F),t.unbindTexture()}}},this.updateMultisampleRenderTarget=function(M){if(M.samples>0){if(C(M)===!1){const S=M.textures,L=M.width,R=M.height;let I=r.COLOR_BUFFER_BIT;const F=M.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,y=n.get(M),N=S.length>1;if(N)for(let w=0;w<S.length;w++)t.bindFramebuffer(r.FRAMEBUFFER,y.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+w,r.RENDERBUFFER,null),t.bindFramebuffer(r.FRAMEBUFFER,y.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+w,r.TEXTURE_2D,null,0);t.bindFramebuffer(r.READ_FRAMEBUFFER,y.__webglMultisampledFramebuffer),t.bindFramebuffer(r.DRAW_FRAMEBUFFER,y.__webglFramebuffer);for(let w=0;w<S.length;w++){if(M.resolveDepthBuffer&&(M.depthBuffer&&(I|=r.DEPTH_BUFFER_BIT),M.stencilBuffer&&M.resolveStencilBuffer&&(I|=r.STENCIL_BUFFER_BIT)),N){r.framebufferRenderbuffer(r.READ_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,y.__webglColorRenderbuffer[w]);const V=n.get(S[w]).__webglTexture;r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,V,0)}r.blitFramebuffer(0,0,L,R,0,0,L,R,I,r.NEAREST),l===!0&&(g.length=0,T.length=0,g.push(r.COLOR_ATTACHMENT0+w),M.depthBuffer&&M.resolveDepthBuffer===!1&&(g.push(F),T.push(F),r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,T)),r.invalidateFramebuffer(r.READ_FRAMEBUFFER,g))}if(t.bindFramebuffer(r.READ_FRAMEBUFFER,null),t.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),N)for(let w=0;w<S.length;w++){t.bindFramebuffer(r.FRAMEBUFFER,y.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+w,r.RENDERBUFFER,y.__webglColorRenderbuffer[w]);const V=n.get(S[w]).__webglTexture;t.bindFramebuffer(r.FRAMEBUFFER,y.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+w,r.TEXTURE_2D,V,0)}t.bindFramebuffer(r.DRAW_FRAMEBUFFER,y.__webglMultisampledFramebuffer)}else if(M.depthBuffer&&M.resolveDepthBuffer===!1&&l){const S=M.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,[S])}}},this.setupDepthRenderbuffer=E,this.setupFrameBufferTexture=re,this.useMultisampledRTT=C}function Zh(r,e){return{convert:function(t,n=""){let i;const a=Ve.getTransfer(n);if(t===ui)return r.UNSIGNED_BYTE;if(t===1017)return r.UNSIGNED_SHORT_4_4_4_4;if(t===1018)return r.UNSIGNED_SHORT_5_5_5_1;if(t===35902)return r.UNSIGNED_INT_5_9_9_9_REV;if(t===1010)return r.BYTE;if(t===1011)return r.SHORT;if(t===Dr)return r.UNSIGNED_SHORT;if(t===to)return r.INT;if(t===hi)return r.UNSIGNED_INT;if(t===It)return r.FLOAT;if(t===rn)return r.HALF_FLOAT;if(t===1021)return r.ALPHA;if(t===1022)return r.RGB;if(t===qt)return r.RGBA;if(t===1024)return r.LUMINANCE;if(t===1025)return r.LUMINANCE_ALPHA;if(t===Qi)return r.DEPTH_COMPONENT;if(t===pi)return r.DEPTH_STENCIL;if(t===Ur)return r.RED;if(t===1029)return r.RED_INTEGER;if(t===1030)return r.RG;if(t===1031)return r.RG_INTEGER;if(t===1033)return r.RGBA_INTEGER;if(t===Ea||t===Ra||t===Ca||t===Pa)if(a===Ze){if(i=e.get("WEBGL_compressed_texture_s3tc_srgb"),i===null)return null;if(t===Ea)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(t===Ra)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(t===Ca)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(t===Pa)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else{if(i=e.get("WEBGL_compressed_texture_s3tc"),i===null)return null;if(t===Ea)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(t===Ra)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(t===Ca)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(t===Pa)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}if(t===35840||t===35841||t===35842||t===35843){if(i=e.get("WEBGL_compressed_texture_pvrtc"),i===null)return null;if(t===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(t===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(t===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(t===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}if(t===36196||t===37492||t===37496){if(i=e.get("WEBGL_compressed_texture_etc"),i===null)return null;if(t===36196||t===37492)return a===Ze?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(t===37496)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC}if(t===37808||t===37809||t===37810||t===37811||t===37812||t===37813||t===37814||t===37815||t===37816||t===37817||t===37818||t===37819||t===37820||t===37821){if(i=e.get("WEBGL_compressed_texture_astc"),i===null)return null;if(t===37808)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(t===37809)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(t===37810)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(t===37811)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(t===37812)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(t===37813)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(t===37814)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(t===37815)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(t===37816)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(t===37817)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(t===37818)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(t===37819)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(t===37820)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(t===37821)return a===Ze?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}if(t===La||t===36494||t===36495){if(i=e.get("EXT_texture_compression_bptc"),i===null)return null;if(t===La)return a===Ze?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(t===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(t===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}if(t===36283||t===36284||t===36285||t===36286){if(i=e.get("EXT_texture_compression_rgtc"),i===null)return null;if(t===La)return i.COMPRESSED_RED_RGTC1_EXT;if(t===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(t===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(t===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}return t===di?r.UNSIGNED_INT_24_8:r[t]!==void 0?r[t]:null}}}class Jh extends At{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e}}class $n extends qe{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Qh={type:"move"};class hs{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new $n,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new $n,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new z,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new z),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new $n,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new z,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new z),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,a=null,s=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){s=!0;for(const x of e.hand.values()){const f=t.getJointPose(x,n),_=this._getHandJoint(c,x);f!==null&&(_.matrix.fromArray(f.transform.matrix),_.matrix.decompose(_.position,_.rotation,_.scale),_.matrixWorldNeedsUpdate=!0,_.jointRadius=f.radius),_.visible=f!==null}const u=c.joints["index-finger-tip"],h=c.joints["thumb-tip"],d=u.position.distanceTo(h.position),p=.02,v=.005;c.inputState.pinching&&d>p+v?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&d<=p-v&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(a=t.getPose(e.gripSpace,n),a!==null&&(l.matrix.fromArray(a.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,a.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(a.linearVelocity)):l.hasLinearVelocity=!1,a.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(a.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&a!==null&&(i=a),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Qh)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=a!==null),c!==null&&(c.visible=s!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new $n;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}class $h{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t,n){if(this.texture===null){const i=new nt;e.properties.get(i).__webglTexture=t.texture,t.depthNear==n.depthNear&&t.depthFar==n.depthFar||(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new ht({vertexShader:`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,fragmentShader:`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new at(new cn(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}}class ed extends jn{constructor(e,t){super();const n=this;let i=null,a=1,s=null,o="local-floor",l=1,c=null,u=null,h=null,d=null,p=null,v=null;const x=new $h,f=t.getContextAttributes();let _=null,m=null;const b=[],P=[],Y=new _e;let D=null;const G=new At;G.layers.enable(1),G.viewport=new je;const X=new At;X.layers.enable(2),X.viewport=new je;const j=[G,X],K=new Jh;K.layers.enable(1),K.layers.enable(2);let ae=null,$=null;function se(U){const C=P.indexOf(U.inputSource);if(C===-1)return;const W=b[C];W!==void 0&&(W.update(U.inputSource,U.frame,c||s),W.dispatchEvent({type:U.type,data:U.inputSource}))}function J(){i.removeEventListener("select",se),i.removeEventListener("selectstart",se),i.removeEventListener("selectend",se),i.removeEventListener("squeeze",se),i.removeEventListener("squeezestart",se),i.removeEventListener("squeezeend",se),i.removeEventListener("end",J),i.removeEventListener("inputsourceschange",ce);for(let U=0;U<b.length;U++){const C=P[U];C!==null&&(P[U]=null,b[U].disconnect(C))}ae=null,$=null,x.reset(),e.setRenderTarget(_),p=null,d=null,h=null,i=null,m=null,T.stop(),n.isPresenting=!1,e.setPixelRatio(D),e.setSize(Y.width,Y.height,!1),n.dispatchEvent({type:"sessionend"})}function ce(U){for(let C=0;C<U.removed.length;C++){const W=U.removed[C],k=P.indexOf(W);k>=0&&(P[k]=null,b[k].disconnect(W))}for(let C=0;C<U.added.length;C++){const W=U.added[C];let k=P.indexOf(W);if(k===-1){for(let S=0;S<b.length;S++){if(S>=P.length){P.push(W),k=S;break}if(P[S]===null){P[S]=W,k=S;break}}if(k===-1)break}const M=b[k];M&&M.connect(W)}}this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(U){let C=b[U];return C===void 0&&(C=new hs,b[U]=C),C.getTargetRaySpace()},this.getControllerGrip=function(U){let C=b[U];return C===void 0&&(C=new hs,b[U]=C),C.getGripSpace()},this.getHand=function(U){let C=b[U];return C===void 0&&(C=new hs,b[U]=C),C.getHandSpace()},this.setFramebufferScaleFactor=function(U){a=U,n.isPresenting},this.setReferenceSpaceType=function(U){o=U,n.isPresenting},this.getReferenceSpace=function(){return c||s},this.setReferenceSpace=function(U){c=U},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return h},this.getFrame=function(){return v},this.getSession=function(){return i},this.setSession=async function(U){if(i=U,i!==null){if(_=e.getRenderTarget(),i.addEventListener("select",se),i.addEventListener("selectstart",se),i.addEventListener("selectend",se),i.addEventListener("squeeze",se),i.addEventListener("squeezestart",se),i.addEventListener("squeezeend",se),i.addEventListener("end",J),i.addEventListener("inputsourceschange",ce),f.xrCompatible!==!0&&await t.makeXRCompatible(),D=e.getPixelRatio(),e.getSize(Y),i.renderState.layers===void 0){const C={antialias:f.antialias,alpha:!0,depth:f.depth,stencil:f.stencil,framebufferScaleFactor:a};p=new XRWebGLLayer(i,t,C),i.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),m=new Tt(p.framebufferWidth,p.framebufferHeight,{format:qt,type:ui,colorSpace:e.outputColorSpace,stencilBuffer:f.stencil})}else{let C=null,W=null,k=null;f.depth&&(k=f.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,C=f.stencil?pi:Qi,W=f.stencil?di:hi);const M={colorFormat:t.RGBA8,depthFormat:k,scaleFactor:a};h=new XRWebGLBinding(i,t),d=h.createProjectionLayer(M),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),m=new Tt(d.textureWidth,d.textureHeight,{format:qt,type:ui,depthTexture:new Ho(d.textureWidth,d.textureHeight,W,void 0,void 0,void 0,void 0,void 0,void 0,C),stencilBuffer:f.stencil,colorSpace:e.outputColorSpace,samples:f.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1})}m.isXRRenderTarget=!0,this.setFoveation(l),c=null,s=await i.requestReferenceSpace(o),T.setContext(i),T.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode};const re=new z,de=new z;function E(U,C){C===null?U.matrixWorld.copy(U.matrix):U.matrixWorld.multiplyMatrices(C.matrixWorld,U.matrix),U.matrixWorldInverse.copy(U.matrixWorld).invert()}this.updateCamera=function(U){if(i===null)return;x.texture!==null&&(U.near=x.depthNear,U.far=x.depthFar),K.near=X.near=G.near=U.near,K.far=X.far=G.far=U.far,ae===K.near&&$===K.far||(i.updateRenderState({depthNear:K.near,depthFar:K.far}),ae=K.near,$=K.far,G.near=ae,G.far=$,X.near=ae,X.far=$,G.updateProjectionMatrix(),X.updateProjectionMatrix(),U.updateProjectionMatrix());const C=U.parent,W=K.cameras;E(K,C);for(let k=0;k<W.length;k++)E(W[k],C);W.length===2?function(k,M,S){re.setFromMatrixPosition(M.matrixWorld),de.setFromMatrixPosition(S.matrixWorld);const L=re.distanceTo(de),R=M.projectionMatrix.elements,I=S.projectionMatrix.elements,F=R[14]/(R[10]-1),y=R[14]/(R[10]+1),N=(R[9]+1)/R[5],w=(R[9]-1)/R[5],V=(R[8]-1)/R[0],B=(I[8]+1)/I[0],ne=F*V,oe=F*B,O=L/(-V+B),q=O*-V;M.matrixWorld.decompose(k.position,k.quaternion,k.scale),k.translateX(q),k.translateZ(O),k.matrixWorld.compose(k.position,k.quaternion,k.scale),k.matrixWorldInverse.copy(k.matrixWorld).invert();const Q=F+O,ue=y+O,me=ne-q,Ae=oe+(L-q),Re=N*y/ue*Q,fe=w*y/ue*Q;k.projectionMatrix.makePerspective(me,Ae,Re,fe,Q,ue),k.projectionMatrixInverse.copy(k.projectionMatrix).invert()}(K,G,X):K.projectionMatrix.copy(G.projectionMatrix),function(k,M,S){S===null?k.matrix.copy(M.matrixWorld):(k.matrix.copy(S.matrixWorld),k.matrix.invert(),k.matrix.multiply(M.matrixWorld)),k.matrix.decompose(k.position,k.quaternion,k.scale),k.updateMatrixWorld(!0),k.projectionMatrix.copy(M.projectionMatrix),k.projectionMatrixInverse.copy(M.projectionMatrixInverse),k.isPerspectiveCamera&&(k.fov=2*vi*Math.atan(1/k.projectionMatrix.elements[5]),k.zoom=1)}(U,K,C)},this.getCamera=function(){return K},this.getFoveation=function(){if(d!==null||p!==null)return l},this.setFoveation=function(U){l=U,d!==null&&(d.fixedFoveation=U),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=U)},this.hasDepthSensing=function(){return x.texture!==null},this.getDepthSensingMesh=function(){return x.getMesh(K)};let g=null;const T=new Io;T.setAnimationLoop(function(U,C){if(u=C.getViewerPose(c||s),v=C,u!==null){const W=u.views;p!==null&&(e.setRenderTargetFramebuffer(m,p.framebuffer),e.setRenderTarget(m));let k=!1;W.length!==K.cameras.length&&(K.cameras.length=0,k=!0);for(let S=0;S<W.length;S++){const L=W[S];let R=null;if(p!==null)R=p.getViewport(L);else{const F=h.getViewSubImage(d,L);R=F.viewport,S===0&&(e.setRenderTargetTextures(m,F.colorTexture,d.ignoreDepthValues?void 0:F.depthStencilTexture),e.setRenderTarget(m))}let I=j[S];I===void 0&&(I=new At,I.layers.enable(S),I.viewport=new je,j[S]=I),I.matrix.fromArray(L.transform.matrix),I.matrix.decompose(I.position,I.quaternion,I.scale),I.projectionMatrix.fromArray(L.projectionMatrix),I.projectionMatrixInverse.copy(I.projectionMatrix).invert(),I.viewport.set(R.x,R.y,R.width,R.height),S===0&&(K.matrix.copy(I.matrix),K.matrix.decompose(K.position,K.quaternion,K.scale)),k===!0&&K.cameras.push(I)}const M=i.enabledFeatures;if(M&&M.includes("depth-sensing")){const S=h.getDepthInformation(W[0]);S&&S.isValid&&S.texture&&x.init(e,S,i.renderState)}}for(let W=0;W<b.length;W++){const k=P[W],M=b[W];k!==null&&M!==void 0&&M.update(k,C,c||s)}g&&g(U,C),C.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:C}),v=null}),this.setAnimationLoop=function(U){g=U},this.dispose=function(){}}}const ei=new sn,td=new Pe;function nd(r,e){function t(i,a){i.matrixAutoUpdate===!0&&i.updateMatrix(),a.value.copy(i.matrix)}function n(i,a){i.opacity.value=a.opacity,a.color&&i.diffuse.value.copy(a.color),a.emissive&&i.emissive.value.copy(a.emissive).multiplyScalar(a.emissiveIntensity),a.map&&(i.map.value=a.map,t(a.map,i.mapTransform)),a.alphaMap&&(i.alphaMap.value=a.alphaMap,t(a.alphaMap,i.alphaMapTransform)),a.bumpMap&&(i.bumpMap.value=a.bumpMap,t(a.bumpMap,i.bumpMapTransform),i.bumpScale.value=a.bumpScale,a.side===Lt&&(i.bumpScale.value*=-1)),a.normalMap&&(i.normalMap.value=a.normalMap,t(a.normalMap,i.normalMapTransform),i.normalScale.value.copy(a.normalScale),a.side===Lt&&i.normalScale.value.negate()),a.displacementMap&&(i.displacementMap.value=a.displacementMap,t(a.displacementMap,i.displacementMapTransform),i.displacementScale.value=a.displacementScale,i.displacementBias.value=a.displacementBias),a.emissiveMap&&(i.emissiveMap.value=a.emissiveMap,t(a.emissiveMap,i.emissiveMapTransform)),a.specularMap&&(i.specularMap.value=a.specularMap,t(a.specularMap,i.specularMapTransform)),a.alphaTest>0&&(i.alphaTest.value=a.alphaTest);const s=e.get(a),o=s.envMap,l=s.envMapRotation;o&&(i.envMap.value=o,ei.copy(l),ei.x*=-1,ei.y*=-1,ei.z*=-1,o.isCubeTexture&&o.isRenderTargetTexture===!1&&(ei.y*=-1,ei.z*=-1),i.envMapRotation.value.setFromMatrix4(td.makeRotationFromEuler(ei)),i.flipEnvMap.value=o.isCubeTexture&&o.isRenderTargetTexture===!1?-1:1,i.reflectivity.value=a.reflectivity,i.ior.value=a.ior,i.refractionRatio.value=a.refractionRatio),a.lightMap&&(i.lightMap.value=a.lightMap,i.lightMapIntensity.value=a.lightMapIntensity,t(a.lightMap,i.lightMapTransform)),a.aoMap&&(i.aoMap.value=a.aoMap,i.aoMapIntensity.value=a.aoMapIntensity,t(a.aoMap,i.aoMapTransform))}return{refreshFogUniforms:function(i,a){a.color.getRGB(i.fogColor.value,Po(r)),a.isFog?(i.fogNear.value=a.near,i.fogFar.value=a.far):a.isFogExp2&&(i.fogDensity.value=a.density)},refreshMaterialUniforms:function(i,a,s,o,l){a.isMeshBasicMaterial||a.isMeshLambertMaterial?n(i,a):a.isMeshToonMaterial?(n(i,a),function(c,u){u.gradientMap&&(c.gradientMap.value=u.gradientMap)}(i,a)):a.isMeshPhongMaterial?(n(i,a),function(c,u){c.specular.value.copy(u.specular),c.shininess.value=Math.max(u.shininess,1e-4)}(i,a)):a.isMeshStandardMaterial?(n(i,a),function(c,u){c.metalness.value=u.metalness,u.metalnessMap&&(c.metalnessMap.value=u.metalnessMap,t(u.metalnessMap,c.metalnessMapTransform)),c.roughness.value=u.roughness,u.roughnessMap&&(c.roughnessMap.value=u.roughnessMap,t(u.roughnessMap,c.roughnessMapTransform)),u.envMap&&(c.envMapIntensity.value=u.envMapIntensity)}(i,a),a.isMeshPhysicalMaterial&&function(c,u,h){c.ior.value=u.ior,u.sheen>0&&(c.sheenColor.value.copy(u.sheenColor).multiplyScalar(u.sheen),c.sheenRoughness.value=u.sheenRoughness,u.sheenColorMap&&(c.sheenColorMap.value=u.sheenColorMap,t(u.sheenColorMap,c.sheenColorMapTransform)),u.sheenRoughnessMap&&(c.sheenRoughnessMap.value=u.sheenRoughnessMap,t(u.sheenRoughnessMap,c.sheenRoughnessMapTransform))),u.clearcoat>0&&(c.clearcoat.value=u.clearcoat,c.clearcoatRoughness.value=u.clearcoatRoughness,u.clearcoatMap&&(c.clearcoatMap.value=u.clearcoatMap,t(u.clearcoatMap,c.clearcoatMapTransform)),u.clearcoatRoughnessMap&&(c.clearcoatRoughnessMap.value=u.clearcoatRoughnessMap,t(u.clearcoatRoughnessMap,c.clearcoatRoughnessMapTransform)),u.clearcoatNormalMap&&(c.clearcoatNormalMap.value=u.clearcoatNormalMap,t(u.clearcoatNormalMap,c.clearcoatNormalMapTransform),c.clearcoatNormalScale.value.copy(u.clearcoatNormalScale),u.side===Lt&&c.clearcoatNormalScale.value.negate())),u.dispersion>0&&(c.dispersion.value=u.dispersion),u.iridescence>0&&(c.iridescence.value=u.iridescence,c.iridescenceIOR.value=u.iridescenceIOR,c.iridescenceThicknessMinimum.value=u.iridescenceThicknessRange[0],c.iridescenceThicknessMaximum.value=u.iridescenceThicknessRange[1],u.iridescenceMap&&(c.iridescenceMap.value=u.iridescenceMap,t(u.iridescenceMap,c.iridescenceMapTransform)),u.iridescenceThicknessMap&&(c.iridescenceThicknessMap.value=u.iridescenceThicknessMap,t(u.iridescenceThicknessMap,c.iridescenceThicknessMapTransform))),u.transmission>0&&(c.transmission.value=u.transmission,c.transmissionSamplerMap.value=h.texture,c.transmissionSamplerSize.value.set(h.width,h.height),u.transmissionMap&&(c.transmissionMap.value=u.transmissionMap,t(u.transmissionMap,c.transmissionMapTransform)),c.thickness.value=u.thickness,u.thicknessMap&&(c.thicknessMap.value=u.thicknessMap,t(u.thicknessMap,c.thicknessMapTransform)),c.attenuationDistance.value=u.attenuationDistance,c.attenuationColor.value.copy(u.attenuationColor)),u.anisotropy>0&&(c.anisotropyVector.value.set(u.anisotropy*Math.cos(u.anisotropyRotation),u.anisotropy*Math.sin(u.anisotropyRotation)),u.anisotropyMap&&(c.anisotropyMap.value=u.anisotropyMap,t(u.anisotropyMap,c.anisotropyMapTransform))),c.specularIntensity.value=u.specularIntensity,c.specularColor.value.copy(u.specularColor),u.specularColorMap&&(c.specularColorMap.value=u.specularColorMap,t(u.specularColorMap,c.specularColorMapTransform)),u.specularIntensityMap&&(c.specularIntensityMap.value=u.specularIntensityMap,t(u.specularIntensityMap,c.specularIntensityMapTransform))}(i,a,l)):a.isMeshMatcapMaterial?(n(i,a),function(c,u){u.matcap&&(c.matcap.value=u.matcap)}(i,a)):a.isMeshDepthMaterial?n(i,a):a.isMeshDistanceMaterial?(n(i,a),function(c,u){const h=e.get(u).light;c.referencePosition.value.setFromMatrixPosition(h.matrixWorld),c.nearDistance.value=h.shadow.camera.near,c.farDistance.value=h.shadow.camera.far}(i,a)):a.isMeshNormalMaterial?n(i,a):a.isLineBasicMaterial?(function(c,u){c.diffuse.value.copy(u.color),c.opacity.value=u.opacity,u.map&&(c.map.value=u.map,t(u.map,c.mapTransform))}(i,a),a.isLineDashedMaterial&&function(c,u){c.dashSize.value=u.dashSize,c.totalSize.value=u.dashSize+u.gapSize,c.scale.value=u.scale}(i,a)):a.isPointsMaterial?function(c,u,h,d){c.diffuse.value.copy(u.color),c.opacity.value=u.opacity,c.size.value=u.size*h,c.scale.value=.5*d,u.map&&(c.map.value=u.map,t(u.map,c.uvTransform)),u.alphaMap&&(c.alphaMap.value=u.alphaMap,t(u.alphaMap,c.alphaMapTransform)),u.alphaTest>0&&(c.alphaTest.value=u.alphaTest)}(i,a,s,o):a.isSpriteMaterial?function(c,u){c.diffuse.value.copy(u.color),c.opacity.value=u.opacity,c.rotation.value=u.rotation,u.map&&(c.map.value=u.map,t(u.map,c.mapTransform)),u.alphaMap&&(c.alphaMap.value=u.alphaMap,t(u.alphaMap,c.alphaMapTransform)),u.alphaTest>0&&(c.alphaTest.value=u.alphaTest)}(i,a):a.isShadowMaterial?(i.color.value.copy(a.color),i.opacity.value=a.opacity):a.isShaderMaterial&&(a.uniformsNeedUpdate=!1)}}}function id(r,e,t,n){let i={},a={},s=[];const o=r.getParameter(r.MAX_UNIFORM_BUFFER_BINDINGS);function l(h,d,p,v){const x=h.value,f=d+"_"+p;if(v[f]===void 0)return v[f]=typeof x=="number"||typeof x=="boolean"?x:x.clone(),!0;{const _=v[f];if(typeof x=="number"||typeof x=="boolean"){if(_!==x)return v[f]=x,!0}else if(_.equals(x)===!1)return _.copy(x),!0}return!1}function c(h){const d={boundary:0,storage:0};return typeof h=="number"||typeof h=="boolean"?(d.boundary=4,d.storage=4):h.isVector2?(d.boundary=8,d.storage=8):h.isVector3||h.isColor?(d.boundary=16,d.storage=12):h.isVector4?(d.boundary=16,d.storage=16):h.isMatrix3?(d.boundary=48,d.storage=48):h.isMatrix4?(d.boundary=64,d.storage=64):h.isTexture,d}function u(h){const d=h.target;d.removeEventListener("dispose",u);const p=s.indexOf(d.__bindingPointIndex);s.splice(p,1),r.deleteBuffer(i[d.id]),delete i[d.id],delete a[d.id]}return{bind:function(h,d){const p=d.program;n.uniformBlockBinding(h,p)},update:function(h,d){let p=i[h.id];p===void 0&&(function(f){const _=f.uniforms;let m=0;const b=16;for(let Y=0,D=_.length;Y<D;Y++){const G=Array.isArray(_[Y])?_[Y]:[_[Y]];for(let X=0,j=G.length;X<j;X++){const K=G[X],ae=Array.isArray(K.value)?K.value:[K.value];for(let $=0,se=ae.length;$<se;$++){const J=c(ae[$]),ce=m%b;ce!==0&&b-ce<J.boundary&&(m+=b-ce),K.__data=new Float32Array(J.storage/Float32Array.BYTES_PER_ELEMENT),K.__offset=m,m+=J.storage}}}const P=m%b;P>0&&(m+=b-P),f.__size=m,f.__cache={}}(h),p=function(f){const _=function(){for(let Y=0;Y<o;Y++)if(s.indexOf(Y)===-1)return s.push(Y),Y;return 0}();f.__bindingPointIndex=_;const m=r.createBuffer(),b=f.__size,P=f.usage;return r.bindBuffer(r.UNIFORM_BUFFER,m),r.bufferData(r.UNIFORM_BUFFER,b,P),r.bindBuffer(r.UNIFORM_BUFFER,null),r.bindBufferBase(r.UNIFORM_BUFFER,_,m),m}(h),i[h.id]=p,h.addEventListener("dispose",u));const v=d.program;n.updateUBOMapping(h,v);const x=e.render.frame;a[h.id]!==x&&(function(f){const _=i[f.id],m=f.uniforms,b=f.__cache;r.bindBuffer(r.UNIFORM_BUFFER,_);for(let P=0,Y=m.length;P<Y;P++){const D=Array.isArray(m[P])?m[P]:[m[P]];for(let G=0,X=D.length;G<X;G++){const j=D[G];if(l(j,P,G,b)===!0){const K=j.__offset,ae=Array.isArray(j.value)?j.value:[j.value];let $=0;for(let se=0;se<ae.length;se++){const J=ae[se],ce=c(J);typeof J=="number"||typeof J=="boolean"?(j.__data[0]=J,r.bufferSubData(r.UNIFORM_BUFFER,K+$,j.__data)):J.isMatrix3?(j.__data[0]=J.elements[0],j.__data[1]=J.elements[1],j.__data[2]=J.elements[2],j.__data[3]=0,j.__data[4]=J.elements[3],j.__data[5]=J.elements[4],j.__data[6]=J.elements[5],j.__data[7]=0,j.__data[8]=J.elements[6],j.__data[9]=J.elements[7],j.__data[10]=J.elements[8],j.__data[11]=0):(J.toArray(j.__data,$),$+=ce.storage/Float32Array.BYTES_PER_ELEMENT)}r.bufferSubData(r.UNIFORM_BUFFER,K,j.__data)}}}r.bindBuffer(r.UNIFORM_BUFFER,null)}(h),a[h.id]=x)},dispose:function(){for(const h in i)r.deleteBuffer(i[h]);s=[],i={},a={}}}}class cl extends qe{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new sn,this.environmentIntensity=1,this.environmentRotation=new sn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}class rd{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Ia,this._updateRange={offset:0,count:-1},this.updateRanges=[],this.version=0,this.uuid=Yt()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}get updateRange(){return Fa("THREE.InterleavedBuffer: updateRange() is deprecated and will be removed in r169. Use addUpdateRange() instead."),this._updateRange}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,a=this.stride;i<a;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Yt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Yt()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Et=new z;class ds{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Et.fromBufferAttribute(this,t),Et.applyMatrix4(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Et.fromBufferAttribute(this,t),Et.applyNormalMatrix(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Et.fromBufferAttribute(this,t),Et.transformDirection(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Kt(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=He(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=He(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=He(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=He(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=He(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Kt(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Kt(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Kt(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Kt(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=He(t,this.array),n=He(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=He(t,this.array),n=He(n,this.array),i=He(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,a){return e=e*this.data.stride+this.offset,this.normalized&&(t=He(t,this.array),n=He(n,this.array),i=He(i,this.array),a=He(a,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=a,this}clone(e){if(e===void 0){const t=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let a=0;a<this.itemSize;a++)t.push(this.data.array[i+a])}return new rt(new this.array.constructor(t),this.itemSize,this.normalized)}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new ds(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){const t=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let a=0;a<this.itemSize;a++)t.push(this.data.array[i+a])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}const ul=new z,hl=new je,dl=new je,ad=new z,pl=new Pe,ua=new z,ps=new an,fl=new Pe,fs=new sr;class sd extends at{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=eo,this.bindMatrix=new Pe,this.bindMatrixInverse=new Pe,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const e=this.geometry;this.boundingBox===null&&(this.boundingBox=new _n),this.boundingBox.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ua),this.boundingBox.expandByPoint(ua)}computeBoundingSphere(){const e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new an),this.boundingSphere.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ua),this.boundingSphere.expandByPoint(ua)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){const n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),ps.copy(this.boundingSphere),ps.applyMatrix4(i),e.ray.intersectsSphere(ps)!==!1&&(fl.copy(i).invert(),fs.copy(e.ray).applyMatrix4(fl),this.boundingBox!==null&&fs.intersectsBox(this.boundingBox)===!1||this._computeIntersections(e,t,fs)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const e=new je,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);const a=1/e.manhattanLength();a!==1/0?e.multiplyScalar(a):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===eo?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode==="detached"&&this.bindMatrixInverse.copy(this.bindMatrix).invert()}applyBoneTransform(e,t){const n=this.skeleton,i=this.geometry;hl.fromBufferAttribute(i.attributes.skinIndex,e),dl.fromBufferAttribute(i.attributes.skinWeight,e),ul.copy(t).applyMatrix4(this.bindMatrix),t.set(0,0,0);for(let a=0;a<4;a++){const s=dl.getComponent(a);if(s!==0){const o=hl.getComponent(a);pl.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(ad.copy(ul).applyMatrix4(pl),s)}}return t.applyMatrix4(this.bindMatrixInverse)}}class ml extends qe{constructor(){super(),this.isBone=!0,this.type="Bone"}}class hr extends nt{constructor(e=null,t=1,n=1,i,a,s,o,l,c=1003,u=1003,h,d){super(null,s,o,l,c,u,i,a,h,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const gl=new Pe,od=new Pe;class ms{constructor(e=[],t=[]){this.uuid=Yt(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(16*e.length),t.length===0)this.calculateInverses();else if(e.length!==t.length){this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Pe)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){const n=new Pe;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let a=0,s=e.length;a<s;a++){const o=e[a]?e[a].matrixWorld:od;gl.multiplyMatrices(o,t[a]),gl.toArray(n,16*a)}i!==null&&(i.needsUpdate=!0)}clone(){return new ms(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(4*this.bones.length);e=4*Math.ceil(e/4),e=Math.max(e,4);const t=new Float32Array(e*e*4);t.set(this.boneMatrices);const n=new hr(t,e,e,qt,It);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){const i=this.bones[t];if(i.name===e)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let a=t[e.bones[n]];a===void 0&&(a=new ml),this.bones.push(a),this.boneInverses.push(new Pe().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){const e={metadata:{version:4.6,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;const t=this.bones,n=this.boneInverses;for(let i=0,a=t.length;i<a;i++){const s=t[i];e.bones.push(s.uuid);const o=n[i];e.boneInverses.push(o.toArray())}return e}}class gs extends rt{constructor(e,t,n,i=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const Oi=new Pe,vl=new Pe,ha=[],xl=new _n,ld=new Pe,dr=new at,pr=new an;class cd extends at{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new gs(new Float32Array(16*n),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,ld)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new _n),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Oi),xl.copy(e.boundingBox).applyMatrix4(Oi),this.boundingBox.union(xl)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new an),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Oi),pr.copy(e.boundingSphere).applyMatrix4(Oi),this.boundingSphere.union(pr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,3*e)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,16*e)}getMorphAt(e,t){const n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,a=e*(n.length+1)+1;for(let s=0;s<n.length;s++)n[s]=i[a+s]}raycast(e,t){const n=this.matrixWorld,i=this.count;if(dr.geometry=this.geometry,dr.material=this.material,dr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),pr.copy(this.boundingSphere),pr.applyMatrix4(n),e.ray.intersectsSphere(pr)!==!1))for(let a=0;a<i;a++){this.getMatrixAt(a,Oi),vl.multiplyMatrices(n,Oi),dr.matrixWorld=vl,dr.raycast(e,ha);for(let s=0,o=ha.length;s<o;s++){const l=ha[s];l.instanceId=a,l.object=this,t.push(l)}ha.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new gs(new Float32Array(3*this.instanceMatrix.count),3)),t.toArray(this.instanceColor.array,3*e)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,16*e)}setMorphAt(e,t){const n=t.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new hr(new Float32Array(i*this.count),i,this.count,Ur,It));const a=this.morphTexture.source.data.data;let s=0;for(let c=0;c<n.length;c++)s+=n[c];const o=this.geometry.morphTargetsRelative?1:1-s,l=i*e;a[l]=o,a.set(n,l+1)}updateMorphTargets(){}dispose(){return this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null),this}}class _l extends ln{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Se(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}const da=new z,pa=new z,yl=new Pe,fr=new sr,fa=new an,vs=new z,bl=new z;class xs extends qe{constructor(e=new Bt,t=new _l){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[0];for(let i=1,a=t.count;i<a;i++)da.fromBufferAttribute(t,i-1),pa.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=da.distanceTo(pa);e.setAttribute("lineDistance",new en(n,1))}return this}raycast(e,t){const n=this.geometry,i=this.matrixWorld,a=e.params.Line.threshold,s=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),fa.copy(n.boundingSphere),fa.applyMatrix4(i),fa.radius+=a,e.ray.intersectsSphere(fa)===!1)return;yl.copy(i).invert(),fr.copy(e.ray).applyMatrix4(yl);const o=a/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,u=n.index,h=n.attributes.position;if(u!==null){const d=Math.max(0,s.start),p=Math.min(u.count,s.start+s.count);for(let v=d,x=p-1;v<x;v+=c){const f=u.getX(v),_=u.getX(v+1),m=ma(this,e,fr,l,f,_);m&&t.push(m)}if(this.isLineLoop){const v=u.getX(p-1),x=u.getX(d),f=ma(this,e,fr,l,v,x);f&&t.push(f)}}else{const d=Math.max(0,s.start),p=Math.min(h.count,s.start+s.count);for(let v=d,x=p-1;v<x;v+=c){const f=ma(this,e,fr,l,v,v+1);f&&t.push(f)}if(this.isLineLoop){const v=ma(this,e,fr,l,p-1,d);v&&t.push(v)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){const n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,a=n.length;i<a;i++){const s=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[s]=i}}}}}function ma(r,e,t,n,i,a){const s=r.geometry.attributes.position;if(da.fromBufferAttribute(s,i),pa.fromBufferAttribute(s,a),t.distanceSqToSegment(da,pa,vs,bl)>n)return;vs.applyMatrix4(r.matrixWorld);const o=e.ray.origin.distanceTo(vs);return o<e.near||o>e.far?void 0:{distance:o,point:bl.clone().applyMatrix4(r.matrixWorld),index:i,face:null,faceIndex:null,object:r}}const Sl=new z,Ml=new z;class ud extends xs{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[];for(let i=0,a=t.count;i<a;i+=2)Sl.fromBufferAttribute(t,i),Ml.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+Sl.distanceTo(Ml);e.setAttribute("lineDistance",new en(n,1))}return this}}class hd extends xs{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}}class Tl extends ln{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Se(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const wl=new Pe,_s=new sr,ga=new an,va=new z;class Al extends qe{constructor(e=new Bt,t=new Tl){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,i=this.matrixWorld,a=e.params.Points.threshold,s=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ga.copy(n.boundingSphere),ga.applyMatrix4(i),ga.radius+=a,e.ray.intersectsSphere(ga)===!1)return;wl.copy(i).invert(),_s.copy(e.ray).applyMatrix4(wl);const o=a/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,u=n.attributes.position;if(c!==null)for(let h=Math.max(0,s.start),d=Math.min(c.count,s.start+s.count);h<d;h++){const p=c.getX(h);va.fromBufferAttribute(u,p),El(va,p,l,i,e,t,this)}else for(let h=Math.max(0,s.start),d=Math.min(u.count,s.start+s.count);h<d;h++)va.fromBufferAttribute(u,h),El(va,h,l,i,e,t,this)}updateMorphTargets(){const e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){const n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,a=n.length;i<a;i++){const s=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[s]=i}}}}}function El(r,e,t,n,i,a,s){const o=_s.distanceSqToPoint(r);if(o<t){const l=new z;_s.closestPointToPoint(r,l),l.applyMatrix4(n);const c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;a.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,object:s})}}class ys extends ln{constructor(e){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.type="MeshStandardMaterial",this.color=new Se(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Se(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new _e(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new sn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class hn extends ys{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new _e(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return bt(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Se(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Se(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Se(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}}function xa(r,e,t){return!r||!t&&r.constructor===e?r:typeof e.BYTES_PER_ELEMENT=="number"?new e(r):Array.prototype.slice.call(r)}function dd(r){const e=r.length,t=new Array(e);for(let n=0;n!==e;++n)t[n]=n;return t.sort(function(n,i){return r[n]-r[i]}),t}function Rl(r,e,t){const n=r.length,i=new r.constructor(n);for(let a=0,s=0;s!==n;++a){const o=t[a]*e;for(let l=0;l!==e;++l)i[s++]=r[o+l]}return i}function Cl(r,e,t,n){let i=1,a=r[0];for(;a!==void 0&&a[n]===void 0;)a=r[i++];if(a===void 0)return;let s=a[n];if(s!==void 0)if(Array.isArray(s))do s=a[n],s!==void 0&&(e.push(a.time),t.push.apply(t,s)),a=r[i++];while(a!==void 0);else if(s.toArray!==void 0)do s=a[n],s!==void 0&&(e.push(a.time),s.toArray(t,t.length)),a=r[i++];while(a!==void 0);else do s=a[n],s!==void 0&&(e.push(a.time),t.push(s)),a=r[i++];while(a!==void 0)}class mr{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){const t=this.parameterPositions;let n=this._cachedIndex,i=t[n],a=t[n-1];t:{e:{let s;n:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<a)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(a=i,i=t[++n],e<i)break e}s=t.length;break n}if(e>=a)break t;{const o=t[1];e<o&&(n=2,a=o);for(let l=n-2;;){if(a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=a,a=t[--n-1],e>=a)break e}s=n,n=0}}for(;n<s;){const o=n+s>>>1;e<t[o]?s=o:n=o+1}if(i=t[n],a=t[n-1],a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,a,i)}return this.interpolate_(n,a,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,a=e*i;for(let s=0;s!==i;++s)t[s]=n[a+s];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}}class pd extends mr{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:2400,endingEnd:2400}}intervalChanged_(e,t,n){const i=this.parameterPositions;let a=e-2,s=e+1,o=i[a],l=i[s];if(o===void 0)switch(this.getSettings_().endingStart){case 2401:a=e,o=2*t-n;break;case 2402:a=i.length-2,o=t+i[a]-i[a+1];break;default:a=e,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case 2401:s=e,l=2*n-t;break;case 2402:s=1,l=n+i[1]-i[0];break;default:s=e-1,l=t}const c=.5*(n-t),u=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(l-n),this._offsetPrev=a*u,this._offsetNext=s*u}interpolate_(e,t,n,i){const a=this.resultBuffer,s=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,u=this._offsetPrev,h=this._offsetNext,d=this._weightPrev,p=this._weightNext,v=(n-t)/(i-t),x=v*v,f=x*v,_=-d*f+2*d*x-d*v,m=(1+d)*f+(-1.5-2*d)*x+(-.5+d)*v+1,b=(-1-p)*f+(1.5+p)*x+.5*v,P=p*f-p*x;for(let Y=0;Y!==o;++Y)a[Y]=_*s[u+Y]+m*s[c+Y]+b*s[l+Y]+P*s[h+Y];return a}}class fd extends mr{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){const a=this.resultBuffer,s=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,u=(n-t)/(i-t),h=1-u;for(let d=0;d!==o;++d)a[d]=s[c+d]*h+s[l+d]*u;return a}}class md extends mr{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}}class dn{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=xa(t,this.TimeBufferType),this.values=xa(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){const t=e.constructor;let n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:xa(e.times,Array),values:xa(e.values,Array)};const i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new md(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new fd(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new pd(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case $i:t=this.InterpolantFactoryMethodDiscrete;break;case er:t=this.InterpolantFactoryMethodLinear;break;case Da:t=this.InterpolantFactoryMethodSmooth}if(t===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0){if(e===this.DefaultInterpolation)throw new Error(n);this.setInterpolation(this.DefaultInterpolation)}return this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return $i;case this.InterpolantFactoryMethodLinear:return er;case this.InterpolantFactoryMethodSmooth:return Da}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){const t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){const t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){const n=this.times,i=n.length;let a=0,s=i-1;for(;a!==i&&n[a]<e;)++a;for(;s!==-1&&n[s]>t;)--s;if(++s,a!==0||s!==i){a>=s&&(s=Math.max(s,1),a=s-1);const o=this.getValueSize();this.times=n.slice(a,s),this.values=this.values.slice(a*o,s*o)}return this}validate(){let e=!0;const t=this.getValueSize();t-Math.floor(t)!=0&&(e=!1);const n=this.times,i=this.values,a=n.length;a===0&&(e=!1);let s=null;for(let l=0;l!==a;l++){const c=n[l];if(typeof c=="number"&&isNaN(c)){e=!1;break}if(s!==null&&s>c){e=!1;break}s=c}if(i!==void 0&&(o=i,ArrayBuffer.isView(o)&&!(o instanceof DataView)))for(let l=0,c=i.length;l!==c;++l){const u=i[l];if(isNaN(u)){e=!1;break}}var o;return e}optimize(){const e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Da,a=e.length-1;let s=1;for(let o=1;o<a;++o){let l=!1;const c=e[o];if(c!==e[o+1]&&(o!==1||c!==e[0]))if(i)l=!0;else{const u=o*n,h=u-n,d=u+n;for(let p=0;p!==n;++p){const v=t[u+p];if(v!==t[h+p]||v!==t[d+p]){l=!0;break}}}if(l){if(o!==s){e[s]=e[o];const u=o*n,h=s*n;for(let d=0;d!==n;++d)t[h+d]=t[u+d]}++s}}if(a>0){e[s]=e[a];for(let o=a*n,l=s*n,c=0;c!==n;++c)t[l+c]=t[o+c];++s}return s!==e.length?(this.times=e.slice(0,s),this.values=t.slice(0,s*n)):(this.times=e,this.values=t),this}clone(){const e=this.times.slice(),t=this.values.slice(),n=new this.constructor(this.name,e,t);return n.createInterpolant=this.createInterpolant,n}}dn.prototype.TimeBufferType=Float32Array,dn.prototype.ValueBufferType=Float32Array,dn.prototype.DefaultInterpolation=er;class Fi extends dn{constructor(e,t,n){super(e,t,n)}}Fi.prototype.ValueTypeName="bool",Fi.prototype.ValueBufferType=Array,Fi.prototype.DefaultInterpolation=$i,Fi.prototype.InterpolantFactoryMethodLinear=void 0,Fi.prototype.InterpolantFactoryMethodSmooth=void 0;class Pl extends dn{}Pl.prototype.ValueTypeName="color";class Bi extends dn{}Bi.prototype.ValueTypeName="number";class gd extends mr{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){const a=this.resultBuffer,s=this.sampleValues,o=this.valueSize,l=(n-t)/(i-t);let c=e*o;for(let u=c+o;c!==u;c+=4)Zt.slerpFlat(a,0,s,c-o,s,c,l);return a}}class zi extends dn{InterpolantFactoryMethodLinear(e){return new gd(this.times,this.values,this.getValueSize(),e)}}zi.prototype.ValueTypeName="quaternion",zi.prototype.InterpolantFactoryMethodSmooth=void 0;class ki extends dn{constructor(e,t,n){super(e,t,n)}}ki.prototype.ValueTypeName="string",ki.prototype.ValueBufferType=Array,ki.prototype.DefaultInterpolation=$i,ki.prototype.InterpolantFactoryMethodLinear=void 0,ki.prototype.InterpolantFactoryMethodSmooth=void 0;class Vi extends dn{}Vi.prototype.ValueTypeName="vector";class vd{constructor(e="",t=-1,n=[],i=2500){this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=Yt(),this.duration<0&&this.resetDuration()}static parse(e){const t=[],n=e.tracks,i=1/(e.fps||1);for(let s=0,o=n.length;s!==o;++s)t.push(xd(n[s]).scale(i));const a=new this(e.name,e.duration,t,e.blendMode);return a.uuid=e.uuid,a}static toJSON(e){const t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode};for(let a=0,s=n.length;a!==s;++a)t.push(dn.toJSON(n[a]));return i}static CreateFromMorphTargetSequence(e,t,n,i){const a=t.length,s=[];for(let o=0;o<a;o++){let l=[],c=[];l.push((o+a-1)%a,o,(o+1)%a),c.push(0,1,0);const u=dd(l);l=Rl(l,1,u),c=Rl(c,1,u),i||l[0]!==0||(l.push(a),c.push(c[0])),s.push(new Bi(".morphTargetInfluences["+t[o].name+"]",l,c).scale(1/n))}return new this(e,-1,s)}static findByName(e,t){let n=e;if(!Array.isArray(e)){const i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){const i={},a=/^([\w-]*?)([\d]+)$/;for(let o=0,l=e.length;o<l;o++){const c=e[o],u=c.name.match(a);if(u&&u.length>1){const h=u[1];let d=i[h];d||(i[h]=d=[]),d.push(c)}}const s=[];for(const o in i)s.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return s}static parseAnimation(e,t){if(!e)return null;const n=function(u,h,d,p,v){if(d.length!==0){const x=[],f=[];Cl(d,x,f,p),x.length!==0&&v.push(new u(h,x,f))}},i=[],a=e.name||"default",s=e.fps||30,o=e.blendMode;let l=e.length||-1;const c=e.hierarchy||[];for(let u=0;u<c.length;u++){const h=c[u].keys;if(h&&h.length!==0)if(h[0].morphTargets){const d={};let p;for(p=0;p<h.length;p++)if(h[p].morphTargets)for(let v=0;v<h[p].morphTargets.length;v++)d[h[p].morphTargets[v]]=-1;for(const v in d){const x=[],f=[];for(let _=0;_!==h[p].morphTargets.length;++_){const m=h[p];x.push(m.time),f.push(m.morphTarget===v?1:0)}i.push(new Bi(".morphTargetInfluence["+v+"]",x,f))}l=d.length*s}else{const d=".bones["+t[u].name+"]";n(Vi,d+".position",h,"pos",i),n(zi,d+".quaternion",h,"rot",i),n(Vi,d+".scale",h,"scl",i)}}return i.length===0?null:new this(a,l,i,o)}resetDuration(){let e=0;for(let t=0,n=this.tracks.length;t!==n;++t){const i=this.tracks[t];e=Math.max(e,i.times[i.times.length-1])}return this.duration=e,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){const e=[];for(let t=0;t<this.tracks.length;t++)e.push(this.tracks[t].clone());return new this.constructor(this.name,this.duration,e,this.blendMode)}toJSON(){return this.constructor.toJSON(this)}}function xd(r){if(r.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const e=function(t){switch(t.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Bi;case"vector":case"vector2":case"vector3":case"vector4":return Vi;case"color":return Pl;case"quaternion":return zi;case"bool":case"boolean":return Fi;case"string":return ki}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+t)}(r.type);if(r.times===void 0){const t=[],n=[];Cl(r.keys,t,n,"value"),r.times=t,r.values=n}return e.parse!==void 0?e.parse(r):new e(r.name,r.times,r.values,r.interpolation)}const Fn={enabled:!1,files:{},add:function(r,e){this.enabled!==!1&&(this.files[r]=e)},get:function(r){if(this.enabled!==!1)return this.files[r]},remove:function(r){delete this.files[r]},clear:function(){this.files={}}};class _d{constructor(e,t,n){const i=this;let a,s=!1,o=0,l=0;const c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(u){l++,s===!1&&i.onStart!==void 0&&i.onStart(u,o,l),s=!0},this.itemEnd=function(u){o++,i.onProgress!==void 0&&i.onProgress(u,o,l),o===l&&(s=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(u){i.onError!==void 0&&i.onError(u)},this.resolveURL=function(u){return a?a(u):u},this.setURLModifier=function(u){return a=u,this},this.addHandler=function(u,h){return c.push(u,h),this},this.removeHandler=function(u){const h=c.indexOf(u);return h!==-1&&c.splice(h,2),this},this.getHandler=function(u){for(let h=0,d=c.length;h<d;h+=2){const p=c[h],v=c[h+1];if(p.global&&(p.lastIndex=0),p.test(u))return v}return null}}}const yd=new _d;class Bn{constructor(e){this.manager=e!==void 0?e:yd,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){const n=this;return new Promise(function(i,a){n.load(e,i,t,a)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}}Bn.DEFAULT_MATERIAL_NAME="__DEFAULT";const wn={};class bd extends Error{constructor(e,t){super(e),this.response=t}}class gr extends Bn{constructor(e){super(e)}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const a=Fn.get(e);if(a!==void 0)return this.manager.itemStart(e),setTimeout(()=>{t&&t(a),this.manager.itemEnd(e)},0),a;if(wn[e]!==void 0)return void wn[e].push({onLoad:t,onProgress:n,onError:i});wn[e]=[],wn[e].push({onLoad:t,onProgress:n,onError:i});const s=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin"}),o=this.mimeType,l=this.responseType;fetch(s).then(c=>{if(c.status===200||c.status===0){if(c.status,typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;const u=wn[e],h=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),p=d?parseInt(d):0,v=p!==0;let x=0;const f=new ReadableStream({start(_){(function m(){h.read().then(({done:b,value:P})=>{if(b)_.close();else{x+=P.byteLength;const Y=new ProgressEvent("progress",{lengthComputable:v,loaded:x,total:p});for(let D=0,G=u.length;D<G;D++){const X=u[D];X.onProgress&&X.onProgress(Y)}_.enqueue(P),m()}},b=>{_.error(b)})})()}});return new Response(f)}throw new bd(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(u=>new DOMParser().parseFromString(u,o));case"json":return c.json();default:if(o===void 0)return c.text();{const u=/charset="?([^;"\s]*)"?/i.exec(o),h=u&&u[1]?u[1].toLowerCase():void 0,d=new TextDecoder(h);return c.arrayBuffer().then(p=>d.decode(p))}}}).then(c=>{Fn.add(e,c);const u=wn[e];delete wn[e];for(let h=0,d=u.length;h<d;h++){const p=u[h];p.onLoad&&p.onLoad(c)}}).catch(c=>{const u=wn[e];if(u===void 0)throw this.manager.itemError(e),c;delete wn[e];for(let h=0,d=u.length;h<d;h++){const p=u[h];p.onError&&p.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}}class Sd extends Bn{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const a=this,s=Fn.get(e);if(s!==void 0)return a.manager.itemStart(e),setTimeout(function(){t&&t(s),a.manager.itemEnd(e)},0),s;const o=ir("img");function l(){u(),Fn.add(e,this),t&&t(this),a.manager.itemEnd(e)}function c(h){u(),i&&i(h),a.manager.itemError(e),a.manager.itemEnd(e)}function u(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),a.manager.itemStart(e),o.src=e,o}}class Ll extends Bn{constructor(e){super(e)}load(e,t,n,i){const a=new nt,s=new Sd(this.manager);return s.setCrossOrigin(this.crossOrigin),s.setPath(this.path),s.load(e,function(o){a.image=o,a.needsUpdate=!0,t!==void 0&&t(a)},n,i),a}}class bs extends qe{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Se(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),t}}const Ss=new Pe,Dl=new z,Ul=new z;class Ms{constructor(e){this.camera=e,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new _e(512,512),this.map=null,this.mapPass=null,this.matrix=new Pe,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ns,this._frameExtents=new _e(1,1),this._viewportCount=1,this._viewports=[new je(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;Dl.setFromMatrixPosition(e.matrixWorld),t.position.copy(Dl),Ul.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Ul),t.updateMatrixWorld(),Ss.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ss),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Ss)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),this.mapSize.x===512&&this.mapSize.y===512||(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}class Md extends Ms{constructor(){super(new At(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1}updateMatrices(e){const t=this.camera,n=2*vi*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height,a=e.distance||t.far;n===t.fov&&i===t.aspect&&a===t.far||(t.fov=n,t.aspect=i,t.far=a,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}}class Td extends bs{constructor(e,t,n=0,i=Math.PI/3,a=0,s=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(qe.DEFAULT_UP),this.updateMatrix(),this.target=new qe,this.distance=n,this.angle=i,this.penumbra=a,this.decay=s,this.map=null,this.shadow=new Md}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}const Il=new Pe,vr=new z,Ts=new z;class wd extends Ms{constructor(){super(new At(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new _e(4,2),this._viewportCount=6,this._viewports=[new je(2,1,1,1),new je(0,1,1,1),new je(3,1,1,1),new je(1,1,1,1),new je(3,0,1,1),new je(1,0,1,1)],this._cubeDirections=[new z(1,0,0),new z(-1,0,0),new z(0,0,1),new z(0,0,-1),new z(0,1,0),new z(0,-1,0)],this._cubeUps=[new z(0,1,0),new z(0,1,0),new z(0,1,0),new z(0,1,0),new z(0,0,1),new z(0,0,-1)]}updateMatrices(e,t=0){const n=this.camera,i=this.matrix,a=e.distance||n.far;a!==n.far&&(n.far=a,n.updateProjectionMatrix()),vr.setFromMatrixPosition(e.matrixWorld),n.position.copy(vr),Ts.copy(n.position),Ts.add(this._cubeDirections[t]),n.up.copy(this._cubeUps[t]),n.lookAt(Ts),n.updateMatrixWorld(),i.makeTranslation(-vr.x,-vr.y,-vr.z),Il.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Il)}}class Ad extends bs{constructor(e,t,n=0,i=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new wd}get power(){return 4*this.intensity*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}}class Ed extends Ms{constructor(){super(new aa(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Rd extends bs{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(qe.DEFAULT_UP),this.updateMatrix(),this.target=new qe,this.shadow=new Ed}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}class xr{static decodeText(e){if(typeof TextDecoder<"u")return new TextDecoder().decode(e);let t="";for(let n=0,i=e.length;n<i;n++)t+=String.fromCharCode(e[n]);try{return decodeURIComponent(escape(t))}catch{return t}}static extractUrlBase(e){const t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}}class Cd extends Bn{constructor(e){super(e),this.isImageBitmapLoader=!0,this.options={premultiplyAlpha:"none"}}setOptions(e){return this.options=e,this}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const a=this,s=Fn.get(e);if(s!==void 0)return a.manager.itemStart(e),s.then?void s.then(c=>{t&&t(c),a.manager.itemEnd(e)}).catch(c=>{i&&i(c)}):(setTimeout(function(){t&&t(s),a.manager.itemEnd(e)},0),s);const o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader;const l=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign(a.options,{colorSpaceConversion:"none"}))}).then(function(c){return Fn.add(e,c),t&&t(c),a.manager.itemEnd(e),c}).catch(function(c){i&&i(c),Fn.remove(e),a.manager.itemError(e),a.manager.itemEnd(e)});Fn.add(e,l),a.manager.itemStart(e)}}let _a;class Nl{static getContext(){return _a===void 0&&(_a=new(window.AudioContext||window.webkitAudioContext)),_a}static setContext(e){_a=e}}class Pd extends Bn{constructor(e){super(e)}load(e,t,n,i){const a=this,s=new gr(this.manager);function o(l){i&&i(l),a.manager.itemError(e)}s.setResponseType("arraybuffer"),s.setPath(this.path),s.setRequestHeader(this.requestHeader),s.setWithCredentials(this.withCredentials),s.load(e,function(l){try{const c=l.slice(0);Nl.getContext().decodeAudioData(c,function(u){t(u)}).catch(o)}catch(c){o(c)}},n,i)}}class ws{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=Ol(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){const t=Ol();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}}function Ol(){return(typeof performance>"u"?Date:performance).now()}const ti=new z,Fl=new Zt,Ld=new z,ni=new z;class Dd extends qe{constructor(){super(),this.type="AudioListener",this.context=Nl.getContext(),this.gain=this.context.createGain(),this.gain.connect(this.context.destination),this.filter=null,this.timeDelta=0,this._clock=new ws}getInput(){return this.gain}removeFilter(){return this.filter!==null&&(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination),this.gain.connect(this.context.destination),this.filter=null),this}getFilter(){return this.filter}setFilter(e){return this.filter!==null?(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination)):this.gain.disconnect(this.context.destination),this.filter=e,this.gain.connect(this.filter),this.filter.connect(this.context.destination),this}getMasterVolume(){return this.gain.gain.value}setMasterVolume(e){return this.gain.gain.setTargetAtTime(e,this.context.currentTime,.01),this}updateMatrixWorld(e){super.updateMatrixWorld(e);const t=this.context.listener,n=this.up;if(this.timeDelta=this._clock.getDelta(),this.matrixWorld.decompose(ti,Fl,Ld),ni.set(0,0,-1).applyQuaternion(Fl),t.positionX){const i=this.context.currentTime+this.timeDelta;t.positionX.linearRampToValueAtTime(ti.x,i),t.positionY.linearRampToValueAtTime(ti.y,i),t.positionZ.linearRampToValueAtTime(ti.z,i),t.forwardX.linearRampToValueAtTime(ni.x,i),t.forwardY.linearRampToValueAtTime(ni.y,i),t.forwardZ.linearRampToValueAtTime(ni.z,i),t.upX.linearRampToValueAtTime(n.x,i),t.upY.linearRampToValueAtTime(n.y,i),t.upZ.linearRampToValueAtTime(n.z,i)}else t.setPosition(ti.x,ti.y,ti.z),t.setOrientation(ni.x,ni.y,ni.z,n.x,n.y,n.z)}}class Bl extends qe{constructor(e){super(),this.type="Audio",this.listener=e,this.context=e.context,this.gain=this.context.createGain(),this.gain.connect(e.getInput()),this.autoplay=!1,this.buffer=null,this.detune=0,this.loop=!1,this.loopStart=0,this.loopEnd=0,this.offset=0,this.duration=void 0,this.playbackRate=1,this.isPlaying=!1,this.hasPlaybackControl=!0,this.source=null,this.sourceType="empty",this._startedAt=0,this._progress=0,this._connected=!1,this.filters=[]}getOutput(){return this.gain}setNodeSource(e){return this.hasPlaybackControl=!1,this.sourceType="audioNode",this.source=e,this.connect(),this}setMediaElementSource(e){return this.hasPlaybackControl=!1,this.sourceType="mediaNode",this.source=this.context.createMediaElementSource(e),this.connect(),this}setMediaStreamSource(e){return this.hasPlaybackControl=!1,this.sourceType="mediaStreamNode",this.source=this.context.createMediaStreamSource(e),this.connect(),this}setBuffer(e){return this.buffer=e,this.sourceType="buffer",this.autoplay&&this.play(),this}play(e=0){if(this.isPlaying===!0||this.hasPlaybackControl===!1)return;this._startedAt=this.context.currentTime+e;const t=this.context.createBufferSource();return t.buffer=this.buffer,t.loop=this.loop,t.loopStart=this.loopStart,t.loopEnd=this.loopEnd,t.onended=this.onEnded.bind(this),t.start(this._startedAt,this._progress+this.offset,this.duration),this.isPlaying=!0,this.source=t,this.setDetune(this.detune),this.setPlaybackRate(this.playbackRate),this.connect()}pause(){if(this.hasPlaybackControl!==!1)return this.isPlaying===!0&&(this._progress+=Math.max(this.context.currentTime-this._startedAt,0)*this.playbackRate,this.loop===!0&&(this._progress=this._progress%(this.duration||this.buffer.duration)),this.source.stop(),this.source.onended=null,this.isPlaying=!1),this}stop(){if(this.hasPlaybackControl!==!1)return this._progress=0,this.source!==null&&(this.source.stop(),this.source.onended=null),this.isPlaying=!1,this}connect(){if(this.filters.length>0){this.source.connect(this.filters[0]);for(let e=1,t=this.filters.length;e<t;e++)this.filters[e-1].connect(this.filters[e]);this.filters[this.filters.length-1].connect(this.getOutput())}else this.source.connect(this.getOutput());return this._connected=!0,this}disconnect(){if(this._connected!==!1){if(this.filters.length>0){this.source.disconnect(this.filters[0]);for(let e=1,t=this.filters.length;e<t;e++)this.filters[e-1].disconnect(this.filters[e]);this.filters[this.filters.length-1].disconnect(this.getOutput())}else this.source.disconnect(this.getOutput());return this._connected=!1,this}}getFilters(){return this.filters}setFilters(e){return e||(e=[]),this._connected===!0?(this.disconnect(),this.filters=e.slice(),this.connect()):this.filters=e.slice(),this}setDetune(e){return this.detune=e,this.isPlaying===!0&&this.source.detune!==void 0&&this.source.detune.setTargetAtTime(this.detune,this.context.currentTime,.01),this}getDetune(){return this.detune}getFilter(){return this.getFilters()[0]}setFilter(e){return this.setFilters(e?[e]:[])}setPlaybackRate(e){if(this.hasPlaybackControl!==!1)return this.playbackRate=e,this.isPlaying===!0&&this.source.playbackRate.setTargetAtTime(this.playbackRate,this.context.currentTime,.01),this}getPlaybackRate(){return this.playbackRate}onEnded(){this.isPlaying=!1}getLoop(){return this.hasPlaybackControl!==!1&&this.loop}setLoop(e){if(this.hasPlaybackControl!==!1)return this.loop=e,this.isPlaying===!0&&(this.source.loop=this.loop),this}setLoopStart(e){return this.loopStart=e,this}setLoopEnd(e){return this.loopEnd=e,this}getVolume(){return this.gain.gain.value}setVolume(e){return this.gain.gain.setTargetAtTime(e,this.context.currentTime,.01),this}}class zl{constructor(e,t=2048){this.analyser=e.context.createAnalyser(),this.analyser.fftSize=t,this.data=new Uint8Array(this.analyser.frequencyBinCount),e.getOutput().connect(this.analyser)}getFrequencyData(){return this.analyser.getByteFrequencyData(this.data),this.data}getAverageFrequency(){let e=0;const t=this.getFrequencyData();for(let n=0;n<t.length;n++)e+=t[n];return e/t.length}}const As="\\[\\]\\.:\\/",Ud=new RegExp("["+As+"]","g"),Es="[^"+As+"]",Id="[^"+As.replace("\\.","")+"]",Nd=new RegExp("^"+/((?:WC+[\/:])*)/.source.replace("WC",Es)+/(WCOD+)?/.source.replace("WCOD",Id)+/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Es)+/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Es)+"$"),Od=["material","materials","bones","map"];class Ge{constructor(e,t,n){this.path=t,this.parsedPath=n||Ge.parseTrackName(t),this.node=Ge.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new Ge.Composite(e,t,n):new Ge(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Ud,"")}static parseTrackName(e){const t=Nd.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);const n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){const a=n.nodeName.substring(i+1);Od.indexOf(a)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=a)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){const n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){const n=function(a){for(let s=0;s<a.length;s++){const o=a[s];if(o.name===t||o.uuid===t)return o;const l=n(o.children);if(l)return l}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){const n=this.resolvedProperty;for(let i=0,a=n.length;i!==a;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){const n=this.resolvedProperty;for(let i=0,a=n.length;i!==a;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){const n=this.resolvedProperty;for(let i=0,a=n.length;i!==a;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){const n=this.resolvedProperty;for(let i=0,a=n.length;i!==a;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node;const t=this.parsedPath,n=t.objectName,i=t.propertyName;let a=t.propertyIndex;if(e||(e=Ge.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e)return;if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material||!e.material.materials)return;e=e.material.materials;break;case"bones":if(!e.skeleton)return;e=e.skeleton.bones;for(let u=0;u<e.length;u++)if(e[u].name===c){c=u;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material||!e.material.map)return;e=e.material.map;break;default:if(e[n]===void 0)return;e=e[n]}if(c!==void 0){if(e[c]===void 0)return;e=e[c]}}const s=e[i];if(s===void 0){t.nodeName;return}let o=this.Versioning.None;this.targetObject=e,e.needsUpdate!==void 0?o=this.Versioning.NeedsUpdate:e.matrixWorldNeedsUpdate!==void 0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(a!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry||!e.geometry.morphAttributes)return;e.morphTargetDictionary[a]!==void 0&&(a=e.morphTargetDictionary[a])}l=this.BindingType.ArrayElement,this.resolvedProperty=s,this.propertyIndex=a}else s.fromArray!==void 0&&s.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=s):Array.isArray(s)?(l=this.BindingType.EntireArray,this.resolvedProperty=s):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}Ge.Composite=class{constructor(r,e,t){const n=t||Ge.parseTrackName(e);this._targetGroup=r,this._bindings=r.subscribe_(e,n)}getValue(r,e){this.bind();const t=this._targetGroup.nCachedObjects_,n=this._bindings[t];n!==void 0&&n.getValue(r,e)}setValue(r,e){const t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].setValue(r,e)}bind(){const r=this._bindings;for(let e=this._targetGroup.nCachedObjects_,t=r.length;e!==t;++e)r[e].bind()}unbind(){const r=this._bindings;for(let e=this._targetGroup.nCachedObjects_,t=r.length;e!==t;++e)r[e].unbind()}},Ge.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},Ge.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},Ge.prototype.GetterByBindingType=[Ge.prototype._getValue_direct,Ge.prototype._getValue_array,Ge.prototype._getValue_arrayElement,Ge.prototype._getValue_toArray],Ge.prototype.SetterByBindingTypeAndVersioning=[[Ge.prototype._setValue_direct,Ge.prototype._setValue_direct_setNeedsUpdate,Ge.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Ge.prototype._setValue_array,Ge.prototype._setValue_array_setNeedsUpdate,Ge.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Ge.prototype._setValue_arrayElement,Ge.prototype._setValue_arrayElement_setNeedsUpdate,Ge.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Ge.prototype._setValue_fromArray,Ge.prototype._setValue_fromArray_setNeedsUpdate,Ge.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];class Ne{constructor(e){this.value=e}clone(){return new Ne(this.value.clone===void 0?this.value:this.value.clone())}}class kl{constructor(e=1,t=0,n=0){return this.radius=e,this.phi=t,this.theta=n,this}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Math.max(1e-6,Math.min(Math.PI-1e-6,this.phi)),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(bt(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Zi}})),typeof window<"u"&&(window.__THREE__||(window.__THREE__=Zi));const Vl={type:"change"},Rs={type:"start"},Hl={type:"end"},ya=new sr,Gl=new On,Fd=Math.cos(70*ro.DEG2RAD);function Wl(r,e){if(e===0)return r;if(e===2||e===1){let t=r.getIndex();if(t===null){const s=[],o=r.getAttribute("position");if(o===void 0)return r;for(let l=0;l<o.count;l++)s.push(l);r.setIndex(s),t=r.getIndex()}const n=t.count-2,i=[];if(e===2)for(let s=1;s<=n;s++)i.push(t.getX(0)),i.push(t.getX(s)),i.push(t.getX(s+1));else for(let s=0;s<n;s++)s%2==0?(i.push(t.getX(s)),i.push(t.getX(s+1)),i.push(t.getX(s+2))):(i.push(t.getX(s+2)),i.push(t.getX(s+1)),i.push(t.getX(s)));i.length;const a=r.clone();return a.setIndex(i),a.clearGroups(),a}return r}function Bd(){let r={};return{get:function(e){return r[e]},add:function(e,t){r[e]=t},remove:function(e){delete r[e]},removeAll:function(){r={}}}}const Oe={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class zd{constructor(e){this.parser=e,this.name=Oe.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){const a=t[n];a.extensions&&a.extensions[this.name]&&a.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,a.extensions[this.name].light)}}_loadLight(e){const t=this.parser,n="light:"+e;let i=t.cache.get(n);if(i)return i;const a=t.json,s=((a.extensions&&a.extensions[this.name]||{}).lights||[])[e];let o;const l=new Se(16777215);s.color!==void 0&&l.setRGB(s.color[0],s.color[1],s.color[2],yt);const c=s.range!==void 0?s.range:0;switch(s.type){case"directional":o=new Rd(l),o.target.position.set(0,0,-1),o.add(o.target);break;case"point":o=new Ad(l),o.distance=c;break;case"spot":o=new Td(l),o.distance=c,s.spot=s.spot||{},s.spot.innerConeAngle=s.spot.innerConeAngle!==void 0?s.spot.innerConeAngle:0,s.spot.outerConeAngle=s.spot.outerConeAngle!==void 0?s.spot.outerConeAngle:Math.PI/4,o.angle=s.spot.outerConeAngle,o.penumbra=1-s.spot.innerConeAngle/s.spot.outerConeAngle,o.target.position.set(0,0,-1),o.add(o.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+s.type)}return o.position.set(0,0,0),o.decay=2,An(o,s),s.intensity!==void 0&&(o.intensity=s.intensity),o.name=t.createUniqueName(s.name||"light_"+e),i=Promise.resolve(o),t.cache.add(n,i),i}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){const t=this,n=this.parser,i=n.json.nodes[e],a=(i.extensions&&i.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(s){return n._getNodeRef(t.cache,a,s)})}}class kd{constructor(){this.name=Oe.KHR_MATERIALS_UNLIT}getMaterialType(){return Ot}extendParams(e,t,n){const i=[];e.color=new Se(1,1,1),e.opacity=1;const a=t.pbrMetallicRoughness;if(a){if(Array.isArray(a.baseColorFactor)){const s=a.baseColorFactor;e.color.setRGB(s[0],s[1],s[2],yt),e.opacity=s[3]}a.baseColorTexture!==void 0&&i.push(n.assignTexture(e,"map",a.baseColorTexture,_t))}return Promise.all(i)}}class Vd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){const n=this.parser.json.materials[e];if(!n.extensions||!n.extensions[this.name])return Promise.resolve();const i=n.extensions[this.name].emissiveStrength;return i!==void 0&&(t.emissiveIntensity=i),Promise.resolve()}}class Hd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];if(s.clearcoatFactor!==void 0&&(t.clearcoat=s.clearcoatFactor),s.clearcoatTexture!==void 0&&a.push(n.assignTexture(t,"clearcoatMap",s.clearcoatTexture)),s.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=s.clearcoatRoughnessFactor),s.clearcoatRoughnessTexture!==void 0&&a.push(n.assignTexture(t,"clearcoatRoughnessMap",s.clearcoatRoughnessTexture)),s.clearcoatNormalTexture!==void 0&&(a.push(n.assignTexture(t,"clearcoatNormalMap",s.clearcoatNormalTexture)),s.clearcoatNormalTexture.scale!==void 0)){const o=s.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new _e(o,o)}return Promise.all(a)}}class Gd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_DISPERSION}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser.json.materials[e];if(!n.extensions||!n.extensions[this.name])return Promise.resolve();const i=n.extensions[this.name];return t.dispersion=i.dispersion!==void 0?i.dispersion:0,Promise.resolve()}}class Wd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];return s.iridescenceFactor!==void 0&&(t.iridescence=s.iridescenceFactor),s.iridescenceTexture!==void 0&&a.push(n.assignTexture(t,"iridescenceMap",s.iridescenceTexture)),s.iridescenceIor!==void 0&&(t.iridescenceIOR=s.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),s.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=s.iridescenceThicknessMinimum),s.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=s.iridescenceThicknessMaximum),s.iridescenceThicknessTexture!==void 0&&a.push(n.assignTexture(t,"iridescenceThicknessMap",s.iridescenceThicknessTexture)),Promise.all(a)}}class jd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_SHEEN}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[];t.sheenColor=new Se(0,0,0),t.sheenRoughness=0,t.sheen=1;const s=i.extensions[this.name];if(s.sheenColorFactor!==void 0){const o=s.sheenColorFactor;t.sheenColor.setRGB(o[0],o[1],o[2],yt)}return s.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=s.sheenRoughnessFactor),s.sheenColorTexture!==void 0&&a.push(n.assignTexture(t,"sheenColorMap",s.sheenColorTexture,_t)),s.sheenRoughnessTexture!==void 0&&a.push(n.assignTexture(t,"sheenRoughnessMap",s.sheenRoughnessTexture)),Promise.all(a)}}class Xd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];return s.transmissionFactor!==void 0&&(t.transmission=s.transmissionFactor),s.transmissionTexture!==void 0&&a.push(n.assignTexture(t,"transmissionMap",s.transmissionTexture)),Promise.all(a)}}class qd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_VOLUME}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];t.thickness=s.thicknessFactor!==void 0?s.thicknessFactor:0,s.thicknessTexture!==void 0&&a.push(n.assignTexture(t,"thicknessMap",s.thicknessTexture)),t.attenuationDistance=s.attenuationDistance||1/0;const o=s.attenuationColor||[1,1,1];return t.attenuationColor=new Se().setRGB(o[0],o[1],o[2],yt),Promise.all(a)}}class Yd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_IOR}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser.json.materials[e];if(!n.extensions||!n.extensions[this.name])return Promise.resolve();const i=n.extensions[this.name];return t.ior=i.ior!==void 0?i.ior:1.5,Promise.resolve()}}class Kd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_SPECULAR}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];t.specularIntensity=s.specularFactor!==void 0?s.specularFactor:1,s.specularTexture!==void 0&&a.push(n.assignTexture(t,"specularIntensityMap",s.specularTexture));const o=s.specularColorFactor||[1,1,1];return t.specularColor=new Se().setRGB(o[0],o[1],o[2],yt),s.specularColorTexture!==void 0&&a.push(n.assignTexture(t,"specularColorMap",s.specularColorTexture,_t)),Promise.all(a)}}class Zd{constructor(e){this.parser=e,this.name=Oe.EXT_MATERIALS_BUMP}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];return t.bumpScale=s.bumpFactor!==void 0?s.bumpFactor:1,s.bumpTexture!==void 0&&a.push(n.assignTexture(t,"bumpMap",s.bumpTexture)),Promise.all(a)}}class Jd{constructor(e){this.parser=e,this.name=Oe.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){const t=this.parser.json.materials[e];return t.extensions&&t.extensions[this.name]?hn:null}extendMaterialParams(e,t){const n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const a=[],s=i.extensions[this.name];return s.anisotropyStrength!==void 0&&(t.anisotropy=s.anisotropyStrength),s.anisotropyRotation!==void 0&&(t.anisotropyRotation=s.anisotropyRotation),s.anisotropyTexture!==void 0&&a.push(n.assignTexture(t,"anisotropyMap",s.anisotropyTexture)),Promise.all(a)}}class Qd{constructor(e){this.parser=e,this.name=Oe.KHR_TEXTURE_BASISU}loadTexture(e){const t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;const a=i.extensions[this.name],s=t.options.ktx2Loader;if(!s){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,a.source,s)}}class $d{constructor(e){this.parser=e,this.name=Oe.EXT_TEXTURE_WEBP,this.isSupported=null}loadTexture(e){const t=this.name,n=this.parser,i=n.json,a=i.textures[e];if(!a.extensions||!a.extensions[t])return null;const s=a.extensions[t],o=i.images[s.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return this.detectSupport().then(function(c){if(c)return n.loadTextureImage(e,s.source,l);if(i.extensionsRequired&&i.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");return n.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class ep{constructor(e){this.parser=e,this.name=Oe.EXT_TEXTURE_AVIF,this.isSupported=null}loadTexture(e){const t=this.name,n=this.parser,i=n.json,a=i.textures[e];if(!a.extensions||!a.extensions[t])return null;const s=a.extensions[t],o=i.images[s.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return this.detectSupport().then(function(c){if(c)return n.loadTextureImage(e,s.source,l);if(i.extensionsRequired&&i.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");return n.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class tp{constructor(e){this.name=Oe.EXT_MESHOPT_COMPRESSION,this.parser=e}loadBufferView(e){const t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){const i=n.extensions[this.name],a=this.parser.getDependency("buffer",i.buffer),s=this.parser.options.meshoptDecoder;if(!s||!s.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return a.then(function(o){const l=i.byteOffset||0,c=i.byteLength||0,u=i.count,h=i.byteStride,d=new Uint8Array(o,l,c);return s.decodeGltfBufferAsync?s.decodeGltfBufferAsync(u,h,d,i.mode,i.filter).then(function(p){return p.buffer}):s.ready.then(function(){const p=new ArrayBuffer(u*h);return s.decodeGltfBuffer(new Uint8Array(p),u,h,d,i.mode,i.filter),p})})}return null}}class np{constructor(e){this.name=Oe.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;const i=t.meshes[n.mesh];for(const l of i.primitives)if(l.mode!==Ht.TRIANGLES&&l.mode!==Ht.TRIANGLE_STRIP&&l.mode!==Ht.TRIANGLE_FAN&&l.mode!==void 0)return null;const a=n.extensions[this.name].attributes,s=[],o={};for(const l in a)s.push(this.parser.getDependency("accessor",a[l]).then(c=>(o[l]=c,o[l])));return s.length<1?null:(s.push(this.parser.createNodeMesh(e)),Promise.all(s).then(l=>{const c=l.pop(),u=c.isGroup?c.children:[c],h=l[0].count,d=[];for(const p of u){const v=new Pe,x=new z,f=new Zt,_=new z(1,1,1),m=new cd(p.geometry,p.material,h);for(let b=0;b<h;b++)o.TRANSLATION&&x.fromBufferAttribute(o.TRANSLATION,b),o.ROTATION&&f.fromBufferAttribute(o.ROTATION,b),o.SCALE&&_.fromBufferAttribute(o.SCALE,b),m.setMatrixAt(b,v.compose(x,f,_));for(const b in o)if(b==="_COLOR_0"){const P=o[b];m.instanceColor=new gs(P.array,P.itemSize,P.normalized)}else b!=="TRANSLATION"&&b!=="ROTATION"&&b!=="SCALE"&&p.geometry.setAttribute(b,o[b]);qe.prototype.copy.call(m,p),this.parser.assignFinalMaterial(m),d.push(m)}return c.isGroup?(c.clear(),c.add(...d),c):d[0]}))}}const jl="glTF",ip=1313821514,rp=5130562;class ap{constructor(e){this.name=Oe.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(e,0,12),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==jl)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const i=this.header.length-12,a=new DataView(e,12);let s=0;for(;s<i;){const o=a.getUint32(s,!0);s+=4;const l=a.getUint32(s,!0);if(s+=4,l===ip){const c=new Uint8Array(e,12+s,o);this.content=n.decode(c)}else if(l===rp){const c=12+s;this.body=e.slice(c,c+o)}s+=o}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class sp{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=Oe.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){const n=this.json,i=this.dracoLoader,a=e.extensions[this.name].bufferView,s=e.extensions[this.name].attributes,o={},l={},c={};for(const u in s){const h=Ps[u]||u.toLowerCase();o[h]=s[u]}for(const u in e.attributes){const h=Ps[u]||u.toLowerCase();if(s[u]!==void 0){const d=n.accessors[e.attributes[u]],p=Hi[d.componentType];c[h]=p.name,l[h]=d.normalized===!0}}return t.getDependency("bufferView",a).then(function(u){return new Promise(function(h,d){i.decodeDracoFile(u,function(p){for(const v in p.attributes){const x=p.attributes[v],f=l[v];f!==void 0&&(x.normalized=f)}h(p)},o,c,yt,d)})})}}class op{constructor(){this.name=Oe.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord!==void 0&&t.texCoord!==e.channel||t.offset!==void 0||t.rotation!==void 0||t.scale!==void 0)&&(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}}class lp{constructor(){this.name=Oe.KHR_MESH_QUANTIZATION}}class Xl extends mr{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,a=e*i*3+i;for(let s=0;s!==i;s++)t[s]=n[a+s];return t}interpolate_(e,t,n,i){const a=this.resultBuffer,s=this.sampleValues,o=this.valueSize,l=2*o,c=3*o,u=i-t,h=(n-t)/u,d=h*h,p=d*h,v=e*c,x=v-c,f=-2*p+3*d,_=p-d,m=1-f,b=_-d+h;for(let P=0;P!==o;P++){const Y=s[x+P+o],D=s[x+P+l]*u,G=s[v+P+o],X=s[v+P]*u;a[P]=m*Y+b*D+f*G+_*X}return a}}const cp=new Zt;class up extends Xl{interpolate_(e,t,n,i){const a=super.interpolate_(e,t,n,i);return cp.fromArray(a).normalize().toArray(a),a}}const Ht={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Hi={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},ql={9728:ut,9729:Ut,9984:1004,9985:Lr,9986:Ji,9987:Wn},Yl={33071:Cn,33648:Pr,10497:ci},Cs={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Ps={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},zn={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},hp={CUBICSPLINE:void 0,LINEAR:er,STEP:$i},dp="OPAQUE",pp="MASK",fp="BLEND";function ii(r,e,t){for(const n in t.extensions)r[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function An(r,e){e.extras!==void 0&&typeof e.extras=="object"&&Object.assign(r.userData,e.extras)}function mp(r,e){if(r.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)r.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){const t=e.extras.targetNames;if(r.morphTargetInfluences.length===t.length){r.morphTargetDictionary={};for(let n=0,i=t.length;n<i;n++)r.morphTargetDictionary[t[n]]=n}}}function gp(r){let e;const t=r.extensions&&r.extensions[Oe.KHR_DRACO_MESH_COMPRESSION];if(e=t?"draco:"+t.bufferView+":"+t.indices+":"+Ls(t.attributes):r.indices+":"+Ls(r.attributes)+":"+r.mode,r.targets!==void 0)for(let n=0,i=r.targets.length;n<i;n++)e+=":"+Ls(r.targets[n]);return e}function Ls(r){let e="";const t=Object.keys(r).sort();for(let n=0,i=t.length;n<i;n++)e+=t[n]+":"+r[t[n]]+";";return e}function Ds(r){switch(r){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}const vp=new Pe;class xp{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new Bd,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=!1,a=-1;typeof navigator<"u"&&(n=/^((?!chrome|android).)*safari/i.test(navigator.userAgent)===!0,i=navigator.userAgent.indexOf("Firefox")>-1,a=i?navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1]:-1),typeof createImageBitmap>"u"||n||i&&a<98?this.textureLoader=new Ll(this.options.manager):this.textureLoader=new Cd(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new gr(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){const n=this,i=this.json,a=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(s){return s._markDefs&&s._markDefs()}),Promise.all(this._invokeAll(function(s){return s.beforeRoot&&s.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(s){const o={scene:s[0][i.scene||0],scenes:s[0],animations:s[1],cameras:s[2],asset:i.asset,parser:n,userData:{}};return ii(a,o,i),An(o,i),Promise.all(n._invokeAll(function(l){return l.afterRoot&&l.afterRoot(o)})).then(function(){for(const l of o.scenes)l.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){const e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,a=t.length;i<a;i++){const s=t[i].joints;for(let o=0,l=s.length;o<l;o++)e[s[o]].isBone=!0}for(let i=0,a=e.length;i<a;i++){const s=e[i];s.mesh!==void 0&&(this._addNodeRef(this.meshCache,s.mesh),s.skin!==void 0&&(n[s.mesh].isSkinnedMesh=!0)),s.camera!==void 0&&this._addNodeRef(this.cameraCache,s.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;const i=n.clone(),a=(s,o)=>{const l=this.associations.get(s);l!=null&&this.associations.set(o,l);for(const[c,u]of s.children.entries())a(u,o.children[c])};return a(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){const t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){const i=e(t[n]);if(i)return i}return null}_invokeAll(e){const t=Object.values(this.plugins);t.unshift(this);const n=[];for(let i=0;i<t.length;i++){const a=e(t[i]);a&&n.push(a)}return n}getDependency(e,t){const n=e+":"+t;let i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(a){return a.loadNode&&a.loadNode(t)});break;case"mesh":i=this._invokeOne(function(a){return a.loadMesh&&a.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(a){return a.loadBufferView&&a.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(a){return a.loadMaterial&&a.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(a){return a.loadTexture&&a.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(a){return a.loadAnimation&&a.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(a){return a!=this&&a.getDependency&&a.getDependency(e,t)}),!i)throw new Error("Unknown type: "+e)}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){const n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(a,s){return n.getDependency(e,s)})),this.cache.add(e,t)}return t}loadBuffer(e){const t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[Oe.KHR_BINARY_GLTF].body);const i=this.options;return new Promise(function(a,s){n.load(xr.resolveURL(t.uri,i.path),a,void 0,function(){s(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){const t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){const i=t.byteLength||0,a=t.byteOffset||0;return n.slice(a,a+i)})}loadAccessor(e){const t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){const s=Cs[i.type],o=Hi[i.componentType],l=i.normalized===!0,c=new o(i.count*s);return Promise.resolve(new rt(c,s,l))}const a=[];return i.bufferView!==void 0?a.push(this.getDependency("bufferView",i.bufferView)):a.push(null),i.sparse!==void 0&&(a.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),a.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(a).then(function(s){const o=s[0],l=Cs[i.type],c=Hi[i.componentType],u=c.BYTES_PER_ELEMENT,h=u*l,d=i.byteOffset||0,p=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,v=i.normalized===!0;let x,f;if(p&&p!==h){const _=Math.floor(d/p),m="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+_+":"+i.count;let b=t.cache.get(m);b||(x=new c(o,_*p,i.count*p/u),b=new rd(x,p/u),t.cache.add(m,b)),f=new ds(b,l,d%p/u,v)}else x=o===null?new c(i.count*l):new c(o,d,i.count*l),f=new rt(x,l,v);if(i.sparse!==void 0){const _=Cs.SCALAR,m=Hi[i.sparse.indices.componentType],b=i.sparse.indices.byteOffset||0,P=i.sparse.values.byteOffset||0,Y=new m(s[1],b,i.sparse.count*_),D=new c(s[2],P,i.sparse.count*l);o!==null&&(f=new rt(f.array.slice(),f.itemSize,f.normalized));for(let G=0,X=Y.length;G<X;G++){const j=Y[G];if(f.setX(j,D[G*l]),l>=2&&f.setY(j,D[G*l+1]),l>=3&&f.setZ(j,D[G*l+2]),l>=4&&f.setW(j,D[G*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}}return f})}loadTexture(e){const t=this.json,n=this.options,i=t.textures[e].source,a=t.images[i];let s=this.textureLoader;if(a.uri){const o=n.manager.getHandler(a.uri);o!==null&&(s=o)}return this.loadTextureImage(e,i,s)}loadTextureImage(e,t,n){const i=this,a=this.json,s=a.textures[e],o=a.images[t],l=(o.uri||o.bufferView)+":"+s.sampler;if(this.textureCache[l])return this.textureCache[l];const c=this.loadImageSource(t,n).then(function(u){u.flipY=!1,u.name=s.name||o.name||"",u.name===""&&typeof o.uri=="string"&&o.uri.startsWith("data:image/")===!1&&(u.name=o.uri);const h=(a.samplers||{})[s.sampler]||{};return u.magFilter=ql[h.magFilter]||Ut,u.minFilter=ql[h.minFilter]||Wn,u.wrapS=Yl[h.wrapS]||ci,u.wrapT=Yl[h.wrapT]||ci,i.associations.set(u,{textures:e}),u}).catch(function(){return null});return this.textureCache[l]=c,c}loadImageSource(e,t){const n=this,i=this.json,a=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(h=>h.clone());const s=i.images[e],o=self.URL||self.webkitURL;let l=s.uri||"",c=!1;if(s.bufferView!==void 0)l=n.getDependency("bufferView",s.bufferView).then(function(h){c=!0;const d=new Blob([h],{type:s.mimeType});return l=o.createObjectURL(d),l});else if(s.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const u=Promise.resolve(l).then(function(h){return new Promise(function(d,p){let v=d;t.isImageBitmapLoader===!0&&(v=function(x){const f=new nt(x);f.needsUpdate=!0,d(f)}),t.load(xr.resolveURL(h,a.path),v,void 0,p)})}).then(function(h){var d;return c===!0&&o.revokeObjectURL(l),An(h,s),h.userData.mimeType=s.mimeType||((d=s.uri).search(/\.jpe?g($|\?)/i)>0||d.search(/^data\:image\/jpeg/)===0?"image/jpeg":d.search(/\.webp($|\?)/i)>0||d.search(/^data\:image\/webp/)===0?"image/webp":"image/png"),h}).catch(function(h){throw h});return this.sourceCache[e]=u,u}assignTexture(e,t,n,i){const a=this;return this.getDependency("texture",n.index).then(function(s){if(!s)return null;if(n.texCoord!==void 0&&n.texCoord>0&&((s=s.clone()).channel=n.texCoord),a.extensions[Oe.KHR_TEXTURE_TRANSFORM]){const o=n.extensions!==void 0?n.extensions[Oe.KHR_TEXTURE_TRANSFORM]:void 0;if(o){const l=a.associations.get(s);s=a.extensions[Oe.KHR_TEXTURE_TRANSFORM].extendTexture(s,o),a.associations.set(s,l)}}return i!==void 0&&(s.colorSpace=i),e[t]=s,s})}assignFinalMaterial(e){const t=e.geometry;let n=e.material;const i=t.attributes.tangent===void 0,a=t.attributes.color!==void 0,s=t.attributes.normal===void 0;if(e.isPoints){const o="PointsMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new Tl,ln.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,l.sizeAttenuation=!1,this.cache.add(o,l)),n=l}else if(e.isLine){const o="LineBasicMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new _l,ln.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,this.cache.add(o,l)),n=l}if(i||a||s){let o="ClonedMaterial:"+n.uuid+":";i&&(o+="derivative-tangents:"),a&&(o+="vertex-colors:"),s&&(o+="flat-shading:");let l=this.cache.get(o);l||(l=n.clone(),a&&(l.vertexColors=!0),s&&(l.flatShading=!0),i&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(o,l),this.associations.set(l,this.associations.get(n))),n=l}e.material=n}getMaterialType(){return ys}loadMaterial(e){const t=this,n=this.json,i=this.extensions,a=n.materials[e];let s;const o={},l=[];if((a.extensions||{})[Oe.KHR_MATERIALS_UNLIT]){const u=i[Oe.KHR_MATERIALS_UNLIT];s=u.getMaterialType(),l.push(u.extendParams(o,a,t))}else{const u=a.pbrMetallicRoughness||{};if(o.color=new Se(1,1,1),o.opacity=1,Array.isArray(u.baseColorFactor)){const h=u.baseColorFactor;o.color.setRGB(h[0],h[1],h[2],yt),o.opacity=h[3]}u.baseColorTexture!==void 0&&l.push(t.assignTexture(o,"map",u.baseColorTexture,_t)),o.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,o.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0&&(l.push(t.assignTexture(o,"metalnessMap",u.metallicRoughnessTexture)),l.push(t.assignTexture(o,"roughnessMap",u.metallicRoughnessTexture))),s=this._invokeOne(function(h){return h.getMaterialType&&h.getMaterialType(e)}),l.push(Promise.all(this._invokeAll(function(h){return h.extendMaterialParams&&h.extendMaterialParams(e,o)})))}a.doubleSided===!0&&(o.side=2);const c=a.alphaMode||dp;if(c===fp?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,c===pp&&(o.alphaTest=a.alphaCutoff!==void 0?a.alphaCutoff:.5)),a.normalTexture!==void 0&&s!==Ot&&(l.push(t.assignTexture(o,"normalMap",a.normalTexture)),o.normalScale=new _e(1,1),a.normalTexture.scale!==void 0)){const u=a.normalTexture.scale;o.normalScale.set(u,u)}if(a.occlusionTexture!==void 0&&s!==Ot&&(l.push(t.assignTexture(o,"aoMap",a.occlusionTexture)),a.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=a.occlusionTexture.strength)),a.emissiveFactor!==void 0&&s!==Ot){const u=a.emissiveFactor;o.emissive=new Se().setRGB(u[0],u[1],u[2],yt)}return a.emissiveTexture!==void 0&&s!==Ot&&l.push(t.assignTexture(o,"emissiveMap",a.emissiveTexture,_t)),Promise.all(l).then(function(){const u=new s(o);return a.name&&(u.name=a.name),An(u,a),t.associations.set(u,{materials:e}),a.extensions&&ii(i,u,a),u})}createUniqueName(e){const t=Ge.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){const t=this,n=this.extensions,i=this.primitiveCache;function a(o){return n[Oe.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(l){return Kl(l,o,t)})}const s=[];for(let o=0,l=e.length;o<l;o++){const c=e[o],u=gp(c),h=i[u];if(h)s.push(h.promise);else{let d;d=c.extensions&&c.extensions[Oe.KHR_DRACO_MESH_COMPRESSION]?a(c):Kl(new Bt,c,t),i[u]={primitive:c,promise:d},s.push(d)}}return Promise.all(s)}loadMesh(e){const t=this,n=this.json,i=this.extensions,a=n.meshes[e],s=a.primitives,o=[];for(let c=0,u=s.length;c<u;c++){const h=s[c].material===void 0?((l=this.cache).DefaultMaterial===void 0&&(l.DefaultMaterial=new ys({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:xn})),l.DefaultMaterial):this.getDependency("material",s[c].material);o.push(h)}var l;return o.push(t.loadGeometries(s)),Promise.all(o).then(function(c){const u=c.slice(0,c.length-1),h=c[c.length-1],d=[];for(let v=0,x=h.length;v<x;v++){const f=h[v],_=s[v];let m;const b=u[v];if(_.mode===Ht.TRIANGLES||_.mode===Ht.TRIANGLE_STRIP||_.mode===Ht.TRIANGLE_FAN||_.mode===void 0)m=a.isSkinnedMesh===!0?new sd(f,b):new at(f,b),m.isSkinnedMesh===!0&&m.normalizeSkinWeights(),_.mode===Ht.TRIANGLE_STRIP?m.geometry=Wl(m.geometry,1):_.mode===Ht.TRIANGLE_FAN&&(m.geometry=Wl(m.geometry,2));else if(_.mode===Ht.LINES)m=new ud(f,b);else if(_.mode===Ht.LINE_STRIP)m=new xs(f,b);else if(_.mode===Ht.LINE_LOOP)m=new hd(f,b);else{if(_.mode!==Ht.POINTS)throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+_.mode);m=new Al(f,b)}Object.keys(m.geometry.morphAttributes).length>0&&mp(m,a),m.name=t.createUniqueName(a.name||"mesh_"+e),An(m,a),_.extensions&&ii(i,m,_),t.assignFinalMaterial(m),d.push(m)}for(let v=0,x=d.length;v<x;v++)t.associations.set(d[v],{meshes:e,primitives:v});if(d.length===1)return a.extensions&&ii(i,d[0],a),d[0];const p=new $n;a.extensions&&ii(i,p,a),t.associations.set(p,{meshes:e});for(let v=0,x=d.length;v<x;v++)p.add(d[v]);return p})}loadCamera(e){let t;const n=this.json.cameras[e],i=n[n.type];if(i)return n.type==="perspective"?t=new At(ro.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(t=new aa(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),An(t,n),Promise.resolve(t)}loadSkin(e){const t=this.json.skins[e],n=[];for(let i=0,a=t.joints.length;i<a;i++)n.push(this._loadNodeShallow(t.joints[i]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){const a=i.pop(),s=i,o=[],l=[];for(let c=0,u=s.length;c<u;c++){const h=s[c];if(h){o.push(h);const d=new Pe;a!==null&&d.fromArray(a.array,16*c),l.push(d)}}return new ms(o,l)})}loadAnimation(e){const t=this.json,n=this,i=t.animations[e],a=i.name?i.name:"animation_"+e,s=[],o=[],l=[],c=[],u=[];for(let h=0,d=i.channels.length;h<d;h++){const p=i.channels[h],v=i.samplers[p.sampler],x=p.target,f=x.node,_=i.parameters!==void 0?i.parameters[v.input]:v.input,m=i.parameters!==void 0?i.parameters[v.output]:v.output;x.node!==void 0&&(s.push(this.getDependency("node",f)),o.push(this.getDependency("accessor",_)),l.push(this.getDependency("accessor",m)),c.push(v),u.push(x))}return Promise.all([Promise.all(s),Promise.all(o),Promise.all(l),Promise.all(c),Promise.all(u)]).then(function(h){const d=h[0],p=h[1],v=h[2],x=h[3],f=h[4],_=[];for(let m=0,b=d.length;m<b;m++){const P=d[m],Y=p[m],D=v[m],G=x[m],X=f[m];if(P===void 0)continue;P.updateMatrix&&P.updateMatrix();const j=n._createAnimationTracks(P,Y,D,G,X);if(j)for(let K=0;K<j.length;K++)_.push(j[K])}return new vd(a,void 0,_)})}createNodeMesh(e){const t=this.json,n=this,i=t.nodes[e];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(a){const s=n._getNodeRef(n.meshCache,i.mesh,a);return i.weights!==void 0&&s.traverse(function(o){if(o.isMesh)for(let l=0,c=i.weights.length;l<c;l++)o.morphTargetInfluences[l]=i.weights[l]}),s})}loadNode(e){const t=this,n=this.json.nodes[e],i=t._loadNodeShallow(e),a=[],s=n.children||[];for(let l=0,c=s.length;l<c;l++)a.push(t.getDependency("node",s[l]));const o=n.skin===void 0?Promise.resolve(null):t.getDependency("skin",n.skin);return Promise.all([i,Promise.all(a),o]).then(function(l){const c=l[0],u=l[1],h=l[2];h!==null&&c.traverse(function(d){d.isSkinnedMesh&&d.bind(h,vp)});for(let d=0,p=u.length;d<p;d++)c.add(u[d]);return c})}_loadNodeShallow(e){const t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const a=t.nodes[e],s=a.name?i.createUniqueName(a.name):"",o=[],l=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});return l&&o.push(l),a.camera!==void 0&&o.push(i.getDependency("camera",a.camera).then(function(c){return i._getNodeRef(i.cameraCache,a.camera,c)})),i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let u;if(u=a.isBone===!0?new ml:c.length>1?new $n:c.length===1?c[0]:new qe,u!==c[0])for(let h=0,d=c.length;h<d;h++)u.add(c[h]);if(a.name&&(u.userData.name=a.name,u.name=s),An(u,a),a.extensions&&ii(n,u,a),a.matrix!==void 0){const h=new Pe;h.fromArray(a.matrix),u.applyMatrix4(h)}else a.translation!==void 0&&u.position.fromArray(a.translation),a.rotation!==void 0&&u.quaternion.fromArray(a.rotation),a.scale!==void 0&&u.scale.fromArray(a.scale);return i.associations.has(u)||i.associations.set(u,{}),i.associations.get(u).nodes=e,u}),this.nodeCache[e]}loadScene(e){const t=this.extensions,n=this.json.scenes[e],i=this,a=new $n;n.name&&(a.name=i.createUniqueName(n.name)),An(a,n),n.extensions&&ii(t,a,n);const s=n.nodes||[],o=[];for(let l=0,c=s.length;l<c;l++)o.push(i.getDependency("node",s[l]));return Promise.all(o).then(function(l){for(let c=0,u=l.length;c<u;c++)a.add(l[c]);return i.associations=(c=>{const u=new Map;for(const[h,d]of i.associations)(h instanceof ln||h instanceof nt)&&u.set(h,d);return c.traverse(h=>{const d=i.associations.get(h);d!=null&&u.set(h,d)}),u})(a),a})}_createAnimationTracks(e,t,n,i,a){const s=[],o=e.name?e.name:e.uuid,l=[];let c;switch(zn[a.path]===zn.weights?e.traverse(function(d){d.morphTargetInfluences&&l.push(d.name?d.name:d.uuid)}):l.push(o),zn[a.path]){case zn.weights:c=Bi;break;case zn.rotation:c=zi;break;case zn.position:case zn.scale:c=Vi;break;default:n.itemSize===1?c=Bi:c=Vi}const u=i.interpolation!==void 0?hp[i.interpolation]:er,h=this._getArrayFromAccessor(n);for(let d=0,p=l.length;d<p;d++){const v=new c(l[d]+"."+zn[a.path],t.array,h,u);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(v),s.push(v)}return s}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){const n=Ds(t.constructor),i=new Float32Array(t.length);for(let a=0,s=t.length;a<s;a++)i[a]=t[a]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(t){return new(this instanceof zi?up:Xl)(this.times,this.values,this.getValueSize()/3,t)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function Kl(r,e,t){const n=e.attributes,i=[];function a(s,o){return t.getDependency("accessor",s).then(function(l){r.setAttribute(o,l)})}for(const s in n){const o=Ps[s]||s.toLowerCase();o in r.attributes||i.push(a(n[s],o))}if(e.indices!==void 0&&!r.index){const s=t.getDependency("accessor",e.indices).then(function(o){r.setIndex(o)});i.push(s)}return Ve.workingColorSpace,An(r,e),function(s,o,l){const c=o.attributes,u=new _n;if(c.POSITION===void 0)return;{const p=l.json.accessors[c.POSITION],v=p.min,x=p.max;if(v===void 0||x===void 0)return;if(u.set(new z(v[0],v[1],v[2]),new z(x[0],x[1],x[2])),p.normalized){const f=Ds(Hi[p.componentType]);u.min.multiplyScalar(f),u.max.multiplyScalar(f)}}const h=o.targets;if(h!==void 0){const p=new z,v=new z;for(let x=0,f=h.length;x<f;x++){const _=h[x];if(_.POSITION!==void 0){const m=l.json.accessors[_.POSITION],b=m.min,P=m.max;if(b!==void 0&&P!==void 0){if(v.setX(Math.max(Math.abs(b[0]),Math.abs(P[0]))),v.setY(Math.max(Math.abs(b[1]),Math.abs(P[1]))),v.setZ(Math.max(Math.abs(b[2]),Math.abs(P[2]))),m.normalized){const Y=Ds(Hi[m.componentType]);v.multiplyScalar(Y)}p.max(v)}}}u.expandByVector(p)}s.boundingBox=u;const d=new an;u.getCenter(d.center),d.radius=u.min.distanceTo(u.max)/2,s.boundingSphere=d}(r,e,t),Promise.all(i).then(function(){return e.targets!==void 0?function(s,o,l){let c=!1,u=!1,h=!1;for(let x=0,f=o.length;x<f;x++){const _=o[x];if(_.POSITION!==void 0&&(c=!0),_.NORMAL!==void 0&&(u=!0),_.COLOR_0!==void 0&&(h=!0),c&&u&&h)break}if(!c&&!u&&!h)return Promise.resolve(s);const d=[],p=[],v=[];for(let x=0,f=o.length;x<f;x++){const _=o[x];if(c){const m=_.POSITION!==void 0?l.getDependency("accessor",_.POSITION):s.attributes.position;d.push(m)}if(u){const m=_.NORMAL!==void 0?l.getDependency("accessor",_.NORMAL):s.attributes.normal;p.push(m)}if(h){const m=_.COLOR_0!==void 0?l.getDependency("accessor",_.COLOR_0):s.attributes.color;v.push(m)}}return Promise.all([Promise.all(d),Promise.all(p),Promise.all(v)]).then(function(x){const f=x[0],_=x[1],m=x[2];return c&&(s.morphAttributes.position=f),u&&(s.morphAttributes.normal=_),h&&(s.morphAttributes.color=m),s.morphTargetsRelative=!0,s})}(r,e.targets,t):r})}const Us=new WeakMap;function _p(){let r,e;function t(n,i,a,s,o,l){const c=l.num_components(),u=a.num_points()*c,h=u*o.BYTES_PER_ELEMENT,d=function(x,f){switch(f){case Float32Array:return x.DT_FLOAT32;case Int8Array:return x.DT_INT8;case Int16Array:return x.DT_INT16;case Int32Array:return x.DT_INT32;case Uint8Array:return x.DT_UINT8;case Uint16Array:return x.DT_UINT16;case Uint32Array:return x.DT_UINT32}}(n,o),p=n._malloc(h);i.GetAttributeDataArrayForAllPoints(a,l,d,h,p);const v=new o(n.HEAPF32.buffer,p,u).slice();return n._free(p),{name:s,array:v,itemSize:c}}onmessage=function(n){const i=n.data;switch(i.type){case"init":r=i.decoderConfig,e=new Promise(function(o){r.onModuleLoaded=function(l){o({draco:l})},DracoDecoderModule(r)});break;case"decode":const a=i.buffer,s=i.taskConfig;e.then(o=>{const l=o.draco,c=new l.Decoder;try{const u=function(d,p,v,x){const f=x.attributeIDs,_=x.attributeTypes;let m,b;const P=p.GetEncodedGeometryType(v);if(P===d.TRIANGULAR_MESH)m=new d.Mesh,b=p.DecodeArrayToMesh(v,v.byteLength,m);else{if(P!==d.POINT_CLOUD)throw new Error("THREE.DRACOLoader: Unexpected geometry type.");m=new d.PointCloud,b=p.DecodeArrayToPointCloud(v,v.byteLength,m)}if(!b.ok()||m.ptr===0)throw new Error("THREE.DRACOLoader: Decoding failed: "+b.error_msg());const Y={index:null,attributes:[]};for(const D in f){const G=self[_[D]];let X,j;if(x.useUniqueIDs)j=f[D],X=p.GetAttributeByUniqueId(m,j);else{if(j=p.GetAttributeId(m,d[f[D]]),j===-1)continue;X=p.GetAttribute(m,j)}const K=t(d,p,m,D,G,X);D==="color"&&(K.vertexColorSpace=x.vertexColorSpace),Y.attributes.push(K)}return P===d.TRIANGULAR_MESH&&(Y.index=function(D,G,X){const j=X.num_faces(),K=3*j,ae=4*K,$=D._malloc(ae);G.GetTrianglesUInt32Array(X,ae,$);const se=new Uint32Array(D.HEAPF32.buffer,$,K).slice();return D._free($),{array:se,itemSize:1}}(d,p,m)),d.destroy(m),Y}(l,c,new Int8Array(a),s),h=u.attributes.map(d=>d.array.buffer);u.index&&h.push(u.index.array.buffer),self.postMessage({type:"decode",id:i.id,geometry:u},h)}catch(u){self.postMessage({type:"error",id:i.id,error:u.message})}finally{l.destroy(c)}})}}}class pn{constructor(e,t,n,i,a="div"){this.parent=e,this.object=t,this.property=n,this._disabled=!1,this._hidden=!1,this.initialValue=this.getValue(),this.domElement=document.createElement(a),this.domElement.classList.add("controller"),this.domElement.classList.add(i),this.$name=document.createElement("div"),this.$name.classList.add("name"),pn.nextNameID=pn.nextNameID||0,this.$name.id="lil-gui-name-"+ ++pn.nextNameID,this.$widget=document.createElement("div"),this.$widget.classList.add("widget"),this.$disable=this.$widget,this.domElement.appendChild(this.$name),this.domElement.appendChild(this.$widget),this.domElement.addEventListener("keydown",s=>s.stopPropagation()),this.domElement.addEventListener("keyup",s=>s.stopPropagation()),this.parent.children.push(this),this.parent.controllers.push(this),this.parent.$children.appendChild(this.domElement),this._listenCallback=this._listenCallback.bind(this),this.name(n)}name(e){return this._name=e,this.$name.textContent=e,this}onChange(e){return this._onChange=e,this}_callOnChange(){this.parent._callOnChange(this),this._onChange!==void 0&&this._onChange.call(this,this.getValue()),this._changed=!0}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(){this._changed&&(this.parent._callOnFinishChange(this),this._onFinishChange!==void 0&&this._onFinishChange.call(this,this.getValue())),this._changed=!1}reset(){return this.setValue(this.initialValue),this._callOnFinishChange(),this}enable(e=!0){return this.disable(!e)}disable(e=!0){return e===this._disabled||(this._disabled=e,this.domElement.classList.toggle("disabled",e),this.$disable.toggleAttribute("disabled",e)),this}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}options(e){const t=this.parent.add(this.object,this.property,e);return t.name(this._name),this.destroy(),t}min(e){return this}max(e){return this}step(e){return this}decimals(e){return this}listen(e=!0){return this._listening=e,this._listenCallbackID!==void 0&&(cancelAnimationFrame(this._listenCallbackID),this._listenCallbackID=void 0),this._listening&&this._listenCallback(),this}_listenCallback(){this._listenCallbackID=requestAnimationFrame(this._listenCallback);const e=this.save();e!==this._listenPrevValue&&this.updateDisplay(),this._listenPrevValue=e}getValue(){return this.object[this.property]}setValue(e){return this.getValue()!==e&&(this.object[this.property]=e,this._callOnChange(),this.updateDisplay()),this}updateDisplay(){return this}load(e){return this.setValue(e),this._callOnFinishChange(),this}save(){return this.getValue()}destroy(){this.listen(!1),this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.controllers.splice(this.parent.controllers.indexOf(this),1),this.parent.$children.removeChild(this.domElement)}}class yp extends pn{constructor(e,t,n){super(e,t,n,"boolean","label"),this.$input=document.createElement("input"),this.$input.setAttribute("type","checkbox"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$widget.appendChild(this.$input),this.$input.addEventListener("change",()=>{this.setValue(this.$input.checked),this._callOnFinishChange()}),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.checked=this.getValue(),this}}function Is(r){let e,t;return(e=r.match(/(#|0x)?([a-f0-9]{6})/i))?t=e[2]:(e=r.match(/rgb\(\s*(\d*)\s*,\s*(\d*)\s*,\s*(\d*)\s*\)/))?t=parseInt(e[1]).toString(16).padStart(2,0)+parseInt(e[2]).toString(16).padStart(2,0)+parseInt(e[3]).toString(16).padStart(2,0):(e=r.match(/^#?([a-f0-9])([a-f0-9])([a-f0-9])$/i))&&(t=e[1]+e[1]+e[2]+e[2]+e[3]+e[3]),!!t&&"#"+t}const bp={isPrimitive:!0,match:r=>typeof r=="string",fromHexString:Is,toHexString:Is},_r={isPrimitive:!0,match:r=>typeof r=="number",fromHexString:r=>parseInt(r.substring(1),16),toHexString:r=>"#"+r.toString(16).padStart(6,0)},Sp={isPrimitive:!1,match:r=>Array.isArray(r),fromHexString(r,e,t=1){const n=_r.fromHexString(r);e[0]=(n>>16&255)/255*t,e[1]=(n>>8&255)/255*t,e[2]=(255&n)/255*t},toHexString:([r,e,t],n=1)=>_r.toHexString(r*(n=255/n)<<16^e*n<<8^t*n)},Mp={isPrimitive:!1,match:r=>Object(r)===r,fromHexString(r,e,t=1){const n=_r.fromHexString(r);e.r=(n>>16&255)/255*t,e.g=(n>>8&255)/255*t,e.b=(255&n)/255*t},toHexString:({r,g:e,b:t},n=1)=>_r.toHexString(r*(n=255/n)<<16^e*n<<8^t*n)},Tp=[bp,_r,Sp,Mp];class wp extends pn{constructor(e,t,n,i){var a;super(e,t,n,"color"),this.$input=document.createElement("input"),this.$input.setAttribute("type","color"),this.$input.setAttribute("tabindex",-1),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$text=document.createElement("input"),this.$text.setAttribute("type","text"),this.$text.setAttribute("spellcheck","false"),this.$text.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("display"),this.$display.appendChild(this.$input),this.$widget.appendChild(this.$display),this.$widget.appendChild(this.$text),this._format=(a=this.initialValue,Tp.find(s=>s.match(a))),this._rgbScale=i,this._initialValueHexString=this.save(),this._textFocused=!1,this.$input.addEventListener("input",()=>{this._setValueFromHexString(this.$input.value)}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$text.addEventListener("input",()=>{const s=Is(this.$text.value);s&&this._setValueFromHexString(s)}),this.$text.addEventListener("focus",()=>{this._textFocused=!0,this.$text.select()}),this.$text.addEventListener("blur",()=>{this._textFocused=!1,this.updateDisplay(),this._callOnFinishChange()}),this.$disable=this.$text,this.updateDisplay()}reset(){return this._setValueFromHexString(this._initialValueHexString),this}_setValueFromHexString(e){if(this._format.isPrimitive){const t=this._format.fromHexString(e);this.setValue(t)}else this._format.fromHexString(e,this.getValue(),this._rgbScale),this._callOnChange(),this.updateDisplay()}save(){return this._format.toHexString(this.getValue(),this._rgbScale)}load(e){return this._setValueFromHexString(e),this._callOnFinishChange(),this}updateDisplay(){return this.$input.value=this._format.toHexString(this.getValue(),this._rgbScale),this._textFocused||(this.$text.value=this.$input.value.substring(1)),this.$display.style.backgroundColor=this.$input.value,this}}class Ns extends pn{constructor(e,t,n){super(e,t,n,"function"),this.$button=document.createElement("button"),this.$button.appendChild(this.$name),this.$widget.appendChild(this.$button),this.$button.addEventListener("click",i=>{i.preventDefault(),this.getValue().call(this.object),this._callOnChange()}),this.$button.addEventListener("touchstart",()=>{},{passive:!0}),this.$disable=this.$button}}class Ap extends pn{constructor(e,t,n,i,a,s){super(e,t,n,"number"),this._initInput(),this.min(i),this.max(a);const o=s!==void 0;this.step(o?s:this._getImplicitStep(),o),this.updateDisplay()}decimals(e){return this._decimals=e,this.updateDisplay(),this}min(e){return this._min=e,this._onUpdateMinMax(),this}max(e){return this._max=e,this._onUpdateMinMax(),this}step(e,t=!0){return this._step=e,this._stepExplicit=t,this}updateDisplay(){const e=this.getValue();if(this._hasSlider){let t=(e-this._min)/(this._max-this._min);t=Math.max(0,Math.min(t,1)),this.$fill.style.width=100*t+"%"}return this._inputFocused||(this.$input.value=this._decimals===void 0?e:e.toFixed(this._decimals)),this}_initInput(){this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("aria-labelledby",this.$name.id),window.matchMedia("(pointer: coarse)").matches&&(this.$input.setAttribute("type","number"),this.$input.setAttribute("step","any")),this.$widget.appendChild(this.$input),this.$disable=this.$input;const e=u=>{const h=parseFloat(this.$input.value);isNaN(h)||(this._snapClampSetValue(h+u),this.$input.value=this.getValue())};let t,n,i,a,s,o=!1;const l=u=>{if(o){const h=u.clientX-t,d=u.clientY-n;Math.abs(d)>5?(u.preventDefault(),this.$input.blur(),o=!1,this._setDraggingStyle(!0,"vertical")):Math.abs(h)>5&&c()}if(!o){const h=u.clientY-i;s-=h*this._step*this._arrowKeyMultiplier(u),a+s>this._max?s=this._max-a:a+s<this._min&&(s=this._min-a),this._snapClampSetValue(a+s)}i=u.clientY},c=()=>{this._setDraggingStyle(!1,"vertical"),this._callOnFinishChange(),window.removeEventListener("mousemove",l),window.removeEventListener("mouseup",c)};this.$input.addEventListener("input",()=>{let u=parseFloat(this.$input.value);isNaN(u)||(this._stepExplicit&&(u=this._snap(u)),this.setValue(this._clamp(u)))}),this.$input.addEventListener("keydown",u=>{u.key==="Enter"&&this.$input.blur(),u.code==="ArrowUp"&&(u.preventDefault(),e(this._step*this._arrowKeyMultiplier(u))),u.code==="ArrowDown"&&(u.preventDefault(),e(this._step*this._arrowKeyMultiplier(u)*-1))}),this.$input.addEventListener("wheel",u=>{this._inputFocused&&(u.preventDefault(),e(this._step*this._normalizeMouseWheel(u)))},{passive:!1}),this.$input.addEventListener("mousedown",u=>{t=u.clientX,n=i=u.clientY,o=!0,a=this.getValue(),s=0,window.addEventListener("mousemove",l),window.addEventListener("mouseup",c)}),this.$input.addEventListener("focus",()=>{this._inputFocused=!0}),this.$input.addEventListener("blur",()=>{this._inputFocused=!1,this.updateDisplay(),this._callOnFinishChange()})}_initSlider(){this._hasSlider=!0,this.$slider=document.createElement("div"),this.$slider.classList.add("slider"),this.$fill=document.createElement("div"),this.$fill.classList.add("fill"),this.$slider.appendChild(this.$fill),this.$widget.insertBefore(this.$slider,this.$input),this.domElement.classList.add("hasSlider");const e=d=>{const p=this.$slider.getBoundingClientRect();let v=(x=d,f=p.left,_=p.right,m=this._min,b=this._max,(x-f)/(_-f)*(b-m)+m);var x,f,_,m,b;this._snapClampSetValue(v)},t=d=>{e(d.clientX)},n=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("mousemove",t),window.removeEventListener("mouseup",n)};let i,a,s=!1;const o=d=>{d.preventDefault(),this._setDraggingStyle(!0),e(d.touches[0].clientX),s=!1},l=d=>{if(s){const p=d.touches[0].clientX-i,v=d.touches[0].clientY-a;Math.abs(p)>Math.abs(v)?o(d):(window.removeEventListener("touchmove",l),window.removeEventListener("touchend",c))}else d.preventDefault(),e(d.touches[0].clientX)},c=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("touchmove",l),window.removeEventListener("touchend",c)},u=this._callOnFinishChange.bind(this);let h;this.$slider.addEventListener("mousedown",d=>{this._setDraggingStyle(!0),e(d.clientX),window.addEventListener("mousemove",t),window.addEventListener("mouseup",n)}),this.$slider.addEventListener("touchstart",d=>{d.touches.length>1||(this._hasScrollBar?(i=d.touches[0].clientX,a=d.touches[0].clientY,s=!0):o(d),window.addEventListener("touchmove",l,{passive:!1}),window.addEventListener("touchend",c))},{passive:!1}),this.$slider.addEventListener("wheel",d=>{if(Math.abs(d.deltaX)<Math.abs(d.deltaY)&&this._hasScrollBar)return;d.preventDefault();const p=this._normalizeMouseWheel(d)*this._step;this._snapClampSetValue(this.getValue()+p),this.$input.value=this.getValue(),clearTimeout(h),h=setTimeout(u,400)},{passive:!1})}_setDraggingStyle(e,t="horizontal"){this.$slider&&this.$slider.classList.toggle("active",e),document.body.classList.toggle("lil-gui-dragging",e),document.body.classList.toggle(`lil-gui-${t}`,e)}_getImplicitStep(){return this._hasMin&&this._hasMax?(this._max-this._min)/1e3:.1}_onUpdateMinMax(){!this._hasSlider&&this._hasMin&&this._hasMax&&(this._stepExplicit||this.step(this._getImplicitStep(),!1),this._initSlider(),this.updateDisplay())}_normalizeMouseWheel(e){let{deltaX:t,deltaY:n}=e;return Math.floor(e.deltaY)!==e.deltaY&&e.wheelDelta&&(t=0,n=-e.wheelDelta/120,n*=this._stepExplicit?1:10),t+-n}_arrowKeyMultiplier(e){let t=this._stepExplicit?1:10;return e.shiftKey?t*=10:e.altKey&&(t/=10),t}_snap(e){const t=Math.round(e/this._step)*this._step;return parseFloat(t.toPrecision(15))}_clamp(e){return e<this._min&&(e=this._min),e>this._max&&(e=this._max),e}_snapClampSetValue(e){this.setValue(this._clamp(this._snap(e)))}get _hasScrollBar(){const e=this.parent.root.$children;return e.scrollHeight>e.clientHeight}get _hasMin(){return this._min!==void 0}get _hasMax(){return this._max!==void 0}}class Ep extends pn{constructor(e,t,n,i){super(e,t,n,"option"),this.$select=document.createElement("select"),this.$select.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("display"),this.$select.addEventListener("change",()=>{this.setValue(this._values[this.$select.selectedIndex]),this._callOnFinishChange()}),this.$select.addEventListener("focus",()=>{this.$display.classList.add("focus")}),this.$select.addEventListener("blur",()=>{this.$display.classList.remove("focus")}),this.$widget.appendChild(this.$select),this.$widget.appendChild(this.$display),this.$disable=this.$select,this.options(i)}options(e){return this._values=Array.isArray(e)?e:Object.values(e),this._names=Array.isArray(e)?e:Object.keys(e),this.$select.replaceChildren(),this._names.forEach(t=>{const n=document.createElement("option");n.textContent=t,this.$select.appendChild(n)}),this.updateDisplay(),this}updateDisplay(){const e=this.getValue(),t=this._values.indexOf(e);return this.$select.selectedIndex=t,this.$display.textContent=t===-1?e:this._names[t],this}}class Rp extends pn{constructor(e,t,n){super(e,t,n,"string"),this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("spellcheck","false"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$input.addEventListener("input",()=>{this.setValue(this.$input.value)}),this.$input.addEventListener("keydown",i=>{i.code==="Enter"&&this.$input.blur()}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$widget.appendChild(this.$input),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.value=this.getValue(),this}}let Zl=!1;class Os{constructor({parent:e,autoPlace:t=e===void 0,container:n,width:i,title:a="Controls",closeFolders:s=!1,injectStyles:o=!0,touchStyles:l=!0}={}){if(this.parent=e,this.root=e?e.root:this,this.children=[],this.controllers=[],this.folders=[],this._closed=!1,this._hidden=!1,this.domElement=document.createElement("div"),this.domElement.classList.add("lil-gui"),this.$title=document.createElement("div"),this.$title.classList.add("title"),this.$title.setAttribute("role","button"),this.$title.setAttribute("aria-expanded",!0),this.$title.setAttribute("tabindex",0),this.$title.addEventListener("click",()=>this.openAnimated(this._closed)),this.$title.addEventListener("keydown",c=>{c.code!=="Enter"&&c.code!=="Space"||(c.preventDefault(),this.$title.click())}),this.$title.addEventListener("touchstart",()=>{},{passive:!0}),this.$children=document.createElement("div"),this.$children.classList.add("children"),this.domElement.appendChild(this.$title),this.domElement.appendChild(this.$children),this.title(a),this.parent)return this.parent.children.push(this),this.parent.folders.push(this),void this.parent.$children.appendChild(this.domElement);this.domElement.classList.add("root"),l&&this.domElement.classList.add("allow-touch-styles"),!Zl&&o&&(function(c){const u=document.createElement("style");u.innerHTML=c;const h=document.querySelector("head link[rel=stylesheet], head style");h?document.head.insertBefore(u,h):document.head.appendChild(u)}(`.lil-gui {
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: 1;
  font-weight: normal;
  font-style: normal;
  text-align: left;
  color: var(--text-color);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  --background-color: #1f1f1f;
  --text-color: #ebebeb;
  --title-background-color: #111111;
  --title-text-color: #ebebeb;
  --widget-color: #424242;
  --hover-color: #4f4f4f;
  --focus-color: #595959;
  --number-color: #2cc9ff;
  --string-color: #a2db3c;
  --font-size: 11px;
  --input-font-size: 11px;
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  --font-family-mono: Menlo, Monaco, Consolas, "Droid Sans Mono", monospace;
  --padding: 4px;
  --spacing: 4px;
  --widget-height: 20px;
  --title-height: calc(var(--widget-height) + var(--spacing) * 1.25);
  --name-width: 45%;
  --slider-knob-width: 2px;
  --slider-input-width: 27%;
  --color-input-width: 27%;
  --slider-input-min-width: 45px;
  --color-input-min-width: 45px;
  --folder-indent: 7px;
  --widget-padding: 0 0 0 3px;
  --widget-border-radius: 2px;
  --checkbox-size: calc(0.75 * var(--widget-height));
  --scrollbar-width: 5px;
}
.lil-gui, .lil-gui * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.lil-gui.root {
  width: var(--width, 245px);
  display: flex;
  flex-direction: column;
  background: var(--background-color);
}
.lil-gui.root > .title {
  background: var(--title-background-color);
  color: var(--title-text-color);
}
.lil-gui.root > .children {
  overflow-x: hidden;
  overflow-y: auto;
}
.lil-gui.root > .children::-webkit-scrollbar {
  width: var(--scrollbar-width);
  height: var(--scrollbar-width);
  background: var(--background-color);
}
.lil-gui.root > .children::-webkit-scrollbar-thumb {
  border-radius: var(--scrollbar-width);
  background: var(--focus-color);
}
@media (pointer: coarse) {
  .lil-gui.allow-touch-styles, .lil-gui.allow-touch-styles .lil-gui {
    --widget-height: 28px;
    --padding: 6px;
    --spacing: 6px;
    --font-size: 13px;
    --input-font-size: 16px;
    --folder-indent: 10px;
    --scrollbar-width: 7px;
    --slider-input-min-width: 50px;
    --color-input-min-width: 65px;
  }
}
.lil-gui.force-touch-styles, .lil-gui.force-touch-styles .lil-gui {
  --widget-height: 28px;
  --padding: 6px;
  --spacing: 6px;
  --font-size: 13px;
  --input-font-size: 16px;
  --folder-indent: 10px;
  --scrollbar-width: 7px;
  --slider-input-min-width: 50px;
  --color-input-min-width: 65px;
}
.lil-gui.autoPlace {
  max-height: 100%;
  position: fixed;
  top: 0;
  right: 15px;
  z-index: 1001;
}

.lil-gui .controller {
  display: flex;
  align-items: center;
  padding: 0 var(--padding);
  margin: var(--spacing) 0;
}
.lil-gui .controller.disabled {
  opacity: 0.5;
}
.lil-gui .controller.disabled, .lil-gui .controller.disabled * {
  pointer-events: none !important;
}
.lil-gui .controller > .name {
  min-width: var(--name-width);
  flex-shrink: 0;
  white-space: pre;
  padding-right: var(--spacing);
  line-height: var(--widget-height);
}
.lil-gui .controller .widget {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--widget-height);
}
.lil-gui .controller.string input {
  color: var(--string-color);
}
.lil-gui .controller.boolean {
  cursor: pointer;
}
.lil-gui .controller.color .display {
  width: 100%;
  height: var(--widget-height);
  border-radius: var(--widget-border-radius);
  position: relative;
}
@media (hover: hover) {
  .lil-gui .controller.color .display:hover:before {
    content: " ";
    display: block;
    position: absolute;
    border-radius: var(--widget-border-radius);
    border: 1px solid #fff9;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
  }
}
.lil-gui .controller.color input[type=color] {
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.lil-gui .controller.color input[type=text] {
  margin-left: var(--spacing);
  font-family: var(--font-family-mono);
  min-width: var(--color-input-min-width);
  width: var(--color-input-width);
  flex-shrink: 0;
}
.lil-gui .controller.option select {
  opacity: 0;
  position: absolute;
  width: 100%;
  max-width: 100%;
}
.lil-gui .controller.option .display {
  position: relative;
  pointer-events: none;
  border-radius: var(--widget-border-radius);
  height: var(--widget-height);
  line-height: var(--widget-height);
  max-width: 100%;
  overflow: hidden;
  word-break: break-all;
  padding-left: 0.55em;
  padding-right: 1.75em;
  background: var(--widget-color);
}
@media (hover: hover) {
  .lil-gui .controller.option .display.focus {
    background: var(--focus-color);
  }
}
.lil-gui .controller.option .display.active {
  background: var(--focus-color);
}
.lil-gui .controller.option .display:after {
  font-family: "lil-gui";
  content: "\u2195";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  padding-right: 0.375em;
}
.lil-gui .controller.option .widget,
.lil-gui .controller.option select {
  cursor: pointer;
}
@media (hover: hover) {
  .lil-gui .controller.option .widget:hover .display {
    background: var(--hover-color);
  }
}
.lil-gui .controller.number input {
  color: var(--number-color);
}
.lil-gui .controller.number.hasSlider input {
  margin-left: var(--spacing);
  width: var(--slider-input-width);
  min-width: var(--slider-input-min-width);
  flex-shrink: 0;
}
.lil-gui .controller.number .slider {
  width: 100%;
  height: var(--widget-height);
  background: var(--widget-color);
  border-radius: var(--widget-border-radius);
  padding-right: var(--slider-knob-width);
  overflow: hidden;
  cursor: ew-resize;
  touch-action: pan-y;
}
@media (hover: hover) {
  .lil-gui .controller.number .slider:hover {
    background: var(--hover-color);
  }
}
.lil-gui .controller.number .slider.active {
  background: var(--focus-color);
}
.lil-gui .controller.number .slider.active .fill {
  opacity: 0.95;
}
.lil-gui .controller.number .fill {
  height: 100%;
  border-right: var(--slider-knob-width) solid var(--number-color);
  box-sizing: content-box;
}

.lil-gui-dragging .lil-gui {
  --hover-color: var(--widget-color);
}
.lil-gui-dragging * {
  cursor: ew-resize !important;
}

.lil-gui-dragging.lil-gui-vertical * {
  cursor: ns-resize !important;
}

.lil-gui .title {
  height: var(--title-height);
  line-height: calc(var(--title-height) - 4px);
  font-weight: 600;
  padding: 0 var(--padding);
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  outline: none;
  text-decoration-skip: objects;
}
.lil-gui .title:before {
  font-family: "lil-gui";
  content: "\u25BE";
  padding-right: 2px;
  display: inline-block;
}
.lil-gui .title:active {
  background: var(--title-background-color);
  opacity: 0.75;
}
@media (hover: hover) {
  body:not(.lil-gui-dragging) .lil-gui .title:hover {
    background: var(--title-background-color);
    opacity: 0.85;
  }
  .lil-gui .title:focus {
    text-decoration: underline var(--focus-color);
  }
}
.lil-gui.root > .title:focus {
  text-decoration: none !important;
}
.lil-gui.closed > .title:before {
  content: "\u25B8";
}
.lil-gui.closed > .children {
  transform: translateY(-7px);
  opacity: 0;
}
.lil-gui.closed:not(.transition) > .children {
  display: none;
}
.lil-gui.transition > .children {
  transition-duration: 300ms;
  transition-property: height, opacity, transform;
  transition-timing-function: cubic-bezier(0.2, 0.6, 0.35, 1);
  overflow: hidden;
  pointer-events: none;
}
.lil-gui .children:empty:before {
  content: "Empty";
  padding: 0 var(--padding);
  margin: var(--spacing) 0;
  display: block;
  height: var(--widget-height);
  font-style: italic;
  line-height: var(--widget-height);
  opacity: 0.5;
}
.lil-gui.root > .children > .lil-gui > .title {
  border: 0 solid var(--widget-color);
  border-width: 1px 0;
  transition: border-color 300ms;
}
.lil-gui.root > .children > .lil-gui.closed > .title {
  border-bottom-color: transparent;
}
.lil-gui + .controller {
  border-top: 1px solid var(--widget-color);
  margin-top: 0;
  padding-top: var(--spacing);
}
.lil-gui .lil-gui .lil-gui > .title {
  border: none;
}
.lil-gui .lil-gui .lil-gui > .children {
  border: none;
  margin-left: var(--folder-indent);
  border-left: 2px solid var(--widget-color);
}
.lil-gui .lil-gui .controller {
  border: none;
}

.lil-gui label, .lil-gui input, .lil-gui button {
  -webkit-tap-highlight-color: transparent;
}
.lil-gui input {
  border: 0;
  outline: none;
  font-family: var(--font-family);
  font-size: var(--input-font-size);
  border-radius: var(--widget-border-radius);
  height: var(--widget-height);
  background: var(--widget-color);
  color: var(--text-color);
  width: 100%;
}
@media (hover: hover) {
  .lil-gui input:hover {
    background: var(--hover-color);
  }
  .lil-gui input:active {
    background: var(--focus-color);
  }
}
.lil-gui input:disabled {
  opacity: 1;
}
.lil-gui input[type=text],
.lil-gui input[type=number] {
  padding: var(--widget-padding);
  -moz-appearance: textfield;
}
.lil-gui input[type=text]:focus,
.lil-gui input[type=number]:focus {
  background: var(--focus-color);
}
.lil-gui input[type=checkbox] {
  appearance: none;
  width: var(--checkbox-size);
  height: var(--checkbox-size);
  border-radius: var(--widget-border-radius);
  text-align: center;
  cursor: pointer;
}
.lil-gui input[type=checkbox]:checked:before {
  font-family: "lil-gui";
  content: "\u2713";
  font-size: var(--checkbox-size);
  line-height: var(--checkbox-size);
}
@media (hover: hover) {
  .lil-gui input[type=checkbox]:focus {
    box-shadow: inset 0 0 0 1px var(--focus-color);
  }
}
.lil-gui button {
  outline: none;
  cursor: pointer;
  font-family: var(--font-family);
  font-size: var(--font-size);
  color: var(--text-color);
  width: 100%;
  height: var(--widget-height);
  text-transform: none;
  background: var(--widget-color);
  border-radius: var(--widget-border-radius);
  border: none;
}
@media (hover: hover) {
  .lil-gui button:hover {
    background: var(--hover-color);
  }
  .lil-gui button:focus {
    box-shadow: inset 0 0 0 1px var(--focus-color);
  }
}
.lil-gui button:active {
  background: var(--focus-color);
}

@font-face {
  font-family: "lil-gui";
  src: url("data:application/font-woff;charset=utf-8;base64,d09GRgABAAAAAAUsAAsAAAAACJwAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABHU1VCAAABCAAAAH4AAADAImwmYE9TLzIAAAGIAAAAPwAAAGBKqH5SY21hcAAAAcgAAAD0AAACrukyyJBnbHlmAAACvAAAAF8AAACEIZpWH2hlYWQAAAMcAAAAJwAAADZfcj2zaGhlYQAAA0QAAAAYAAAAJAC5AHhobXR4AAADXAAAABAAAABMAZAAAGxvY2EAAANsAAAAFAAAACgCEgIybWF4cAAAA4AAAAAeAAAAIAEfABJuYW1lAAADoAAAASIAAAIK9SUU/XBvc3QAAATEAAAAZgAAAJCTcMc2eJxVjbEOgjAURU+hFRBK1dGRL+ALnAiToyMLEzFpnPz/eAshwSa97517c/MwwJmeB9kwPl+0cf5+uGPZXsqPu4nvZabcSZldZ6kfyWnomFY/eScKqZNWupKJO6kXN3K9uCVoL7iInPr1X5baXs3tjuMqCtzEuagm/AAlzQgPAAB4nGNgYRBlnMDAysDAYM/gBiT5oLQBAwuDJAMDEwMrMwNWEJDmmsJwgCFeXZghBcjlZMgFCzOiKOIFAB71Bb8AeJy1kjFuwkAQRZ+DwRAwBtNQRUGKQ8OdKCAWUhAgKLhIuAsVSpWz5Bbkj3dEgYiUIszqWdpZe+Z7/wB1oCYmIoboiwiLT2WjKl/jscrHfGg/pKdMkyklC5Zs2LEfHYpjcRoPzme9MWWmk3dWbK9ObkWkikOetJ554fWyoEsmdSlt+uR0pCJR34b6t/TVg1SY3sYvdf8vuiKrpyaDXDISiegp17p7579Gp3p++y7HPAiY9pmTibljrr85qSidtlg4+l25GLCaS8e6rRxNBmsnERunKbaOObRz7N72ju5vdAjYpBXHgJylOAVsMseDAPEP8LYoUHicY2BiAAEfhiAGJgZWBgZ7RnFRdnVJELCQlBSRlATJMoLV2DK4glSYs6ubq5vbKrJLSbGrgEmovDuDJVhe3VzcXFwNLCOILB/C4IuQ1xTn5FPilBTj5FPmBAB4WwoqAHicY2BkYGAA4sk1sR/j+W2+MnAzpDBgAyEMQUCSg4EJxAEAwUgFHgB4nGNgZGBgSGFggJMhDIwMqEAYAByHATJ4nGNgAIIUNEwmAABl3AGReJxjYAACIQYlBiMGJ3wQAEcQBEV4nGNgZGBgEGZgY2BiAAEQyQWEDAz/wXwGAAsPATIAAHicXdBNSsNAHAXwl35iA0UQXYnMShfS9GPZA7T7LgIu03SSpkwzYTIt1BN4Ak/gKTyAeCxfw39jZkjymzcvAwmAW/wgwHUEGDb36+jQQ3GXGot79L24jxCP4gHzF/EIr4jEIe7wxhOC3g2TMYy4Q7+Lu/SHuEd/ivt4wJd4wPxbPEKMX3GI5+DJFGaSn4qNzk8mcbKSR6xdXdhSzaOZJGtdapd4vVPbi6rP+cL7TGXOHtXKll4bY1Xl7EGnPtp7Xy2n00zyKLVHfkHBa4IcJ2oD3cgggWvt/V/FbDrUlEUJhTn/0azVWbNTNr0Ens8de1tceK9xZmfB1CPjOmPH4kitmvOubcNpmVTN3oFJyjzCvnmrwhJTzqzVj9jiSX911FjeAAB4nG3HMRKCMBBA0f0giiKi4DU8k0V2GWbIZDOh4PoWWvq6J5V8If9NVNQcaDhyouXMhY4rPTcG7jwYmXhKq8Wz+p762aNaeYXom2n3m2dLTVgsrCgFJ7OTmIkYbwIbC6vIB7WmFfAAAA==") format("woff");
}`),Zl=!0),n?n.appendChild(this.domElement):t&&(this.domElement.classList.add("autoPlace"),document.body.appendChild(this.domElement)),i&&this.domElement.style.setProperty("--width",i+"px"),this._closeFolders=s}add(e,t,n,i,a){if(Object(n)===n)return new Ep(this,e,t,n);switch(typeof e[t]){case"number":return new Ap(this,e,t,n,i,a);case"boolean":return new yp(this,e,t);case"string":return new Rp(this,e,t);case"function":return new Ns(this,e,t)}}addColor(e,t,n=1){return new wp(this,e,t,n)}addFolder(e){const t=new Os({parent:this,title:e});return this.root._closeFolders&&t.close(),t}load(e,t=!0){return e.controllers&&this.controllers.forEach(n=>{n instanceof Ns||n._name in e.controllers&&n.load(e.controllers[n._name])}),t&&e.folders&&this.folders.forEach(n=>{n._title in e.folders&&n.load(e.folders[n._title])}),this}save(e=!0){const t={controllers:{},folders:{}};return this.controllers.forEach(n=>{if(!(n instanceof Ns)){if(n._name in t.controllers)throw new Error(`Cannot save GUI with duplicate property "${n._name}"`);t.controllers[n._name]=n.save()}}),e&&this.folders.forEach(n=>{if(n._title in t.folders)throw new Error(`Cannot save GUI with duplicate folder "${n._title}"`);t.folders[n._title]=n.save()}),t}open(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),this.domElement.classList.toggle("closed",this._closed),this}close(){return this.open(!1)}_setClosed(e){this._closed!==e&&(this._closed=e,this._callOnOpenClose(this))}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}openAnimated(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),requestAnimationFrame(()=>{const t=this.$children.clientHeight;this.$children.style.height=t+"px",this.domElement.classList.add("transition");const n=a=>{a.target===this.$children&&(this.$children.style.height="",this.domElement.classList.remove("transition"),this.$children.removeEventListener("transitionend",n))};this.$children.addEventListener("transitionend",n);const i=e?this.$children.scrollHeight:0;this.domElement.classList.toggle("closed",!e),requestAnimationFrame(()=>{this.$children.style.height=i+"px"})}),this}title(e){return this._title=e,this.$title.textContent=e,this}reset(e=!0){return(e?this.controllersRecursive():this.controllers).forEach(t=>t.reset()),this}onChange(e){return this._onChange=e,this}_callOnChange(e){this.parent&&this.parent._callOnChange(e),this._onChange!==void 0&&this._onChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(e){this.parent&&this.parent._callOnFinishChange(e),this._onFinishChange!==void 0&&this._onFinishChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onOpenClose(e){return this._onOpenClose=e,this}_callOnOpenClose(e){this.parent&&this.parent._callOnOpenClose(e),this._onOpenClose!==void 0&&this._onOpenClose.call(this,e)}destroy(){this.parent&&(this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.folders.splice(this.parent.folders.indexOf(this),1)),this.domElement.parentElement&&this.domElement.parentElement.removeChild(this.domElement),Array.from(this.children).forEach(e=>e.destroy())}controllersRecursive(){let e=Array.from(this.controllers);return this.folders.forEach(t=>{e=e.concat(t.controllersRecursive())}),e}foldersRecursive(){let e=Array.from(this.folders);return this.folders.forEach(t=>{e=e.concat(t.foldersRecursive())}),e}}const Jl={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class Gi{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){}dispose(){}}const Cp=new aa(-1,1,1,-1,0,1),Pp=new class extends Bt{constructor(){super(),this.setAttribute("position",new en([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new en([0,2,0,0,2,0],2))}};class Fs{constructor(e){this._mesh=new at(Pp,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Cp)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}class Ql extends Gi{constructor(e,t){super(),this.textureID=t!==void 0?t:"tDiffuse",e instanceof ht?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=Kn.clone(e.uniforms),this.material=new ht({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this.fsQuad=new Fs(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this.fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}class $l extends Gi{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){const i=e.getContext(),a=e.state;let s,o;a.buffers.color.setMask(!1),a.buffers.depth.setMask(!1),a.buffers.color.setLocked(!0),a.buffers.depth.setLocked(!0),this.inverse?(s=0,o=1):(s=1,o=0),a.buffers.stencil.setTest(!0),a.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),a.buffers.stencil.setFunc(i.ALWAYS,s,4294967295),a.buffers.stencil.setClear(o),a.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),a.buffers.color.setLocked(!1),a.buffers.depth.setLocked(!1),a.buffers.color.setMask(!0),a.buffers.depth.setMask(!0),a.buffers.stencil.setLocked(!1),a.buffers.stencil.setFunc(i.EQUAL,1,4294967295),a.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),a.buffers.stencil.setLocked(!0)}}class Lp extends Gi{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}}class Dp{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){const n=e.getSize(new _e);this._width=n.width,this._height=n.height,(t=new Tt(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:rn})).texture.name="EffectComposer.rt1"}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ql(Jl),this.copyPass.material.blending=0,this.clock=new ws}swapBuffers(){const e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){const t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){e===void 0&&(e=this.clock.getDelta());const t=this.renderer.getRenderTarget();let n=!1;for(let i=0,a=this.passes.length;i<a;i++){const s=this.passes[i];if(s.enabled!==!1){if(s.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),s.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),s.needsSwap){if(n){const o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}$l!==void 0&&(s instanceof $l?n=!0:s instanceof Lp&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){const t=this.renderer.getSize(new _e);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,(e=this.renderTarget1.clone()).setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;const n=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(n,i),this.renderTarget2.setSize(n,i);for(let a=0;a<this.passes.length;a++)this.passes[a].setSize(n,i)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class Up extends Gi{constructor(e,t,n=null,i=null,a=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=i,this.clearAlpha=a,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new Se}render(e,t,n){const i=e.autoClear;let a,s;e.autoClear=!1,this.overrideMaterial!==null&&(s=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(a=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(a),this.overrideMaterial!==null&&(this.scene.overrideMaterial=s),e.autoClear=i}}const Ip={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Se(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			vec3 luma = vec3( 0.299, 0.587, 0.114 );

			float v = dot( texel.xyz, luma );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class Wi extends Gi{constructor(e,t,n,i){super(),this.strength=t!==void 0?t:1,this.radius=n,this.threshold=i,this.resolution=e!==void 0?new _e(e.x,e.y):new _e(256,256),this.clearColor=new Se(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);this.renderTargetBright=new Tt(a,s,{type:rn}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let u=0;u<this.nMips;u++){const h=new Tt(a,s,{type:rn});h.texture.name="UnrealBloomPass.h"+u,h.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(h);const d=new Tt(a,s,{type:rn});d.texture.name="UnrealBloomPass.v"+u,d.texture.generateMipmaps=!1,this.renderTargetsVertical.push(d),a=Math.round(a/2),s=Math.round(s/2)}const o=Ip;this.highPassUniforms=Kn.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new ht({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];const l=[3,5,7,9,11];a=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);for(let u=0;u<this.nMips;u++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[u])),this.separableBlurMaterials[u].uniforms.invSize.value=new _e(1/a,1/s),a=Math.round(a/2),s=Math.round(s/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1,this.compositeMaterial.uniforms.bloomFactors.value=[1,.8,.6,.4,.2],this.bloomTintColors=[new z(1,1,1),new z(1,1,1),new z(1,1,1),new z(1,1,1),new z(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;const c=Jl;this.copyUniforms=Kn.clone(c.uniforms),this.blendMaterial=new ht({uniforms:this.copyUniforms,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new Se,this.oldClearAlpha=1,this.basic=new Ot,this.fsQuad=new Fs(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),i=Math.round(t/2);this.renderTargetBright.setSize(n,i);for(let a=0;a<this.nMips;a++)this.renderTargetsHorizontal[a].setSize(n,i),this.renderTargetsVertical[a].setSize(n,i),this.separableBlurMaterials[a].uniforms.invSize.value=new _e(1/n,1/i),n=Math.round(n/2),i=Math.round(i/2)}render(e,t,n,i,a){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();const s=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),a&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=n.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=n.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this.fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=Wi.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[l]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=Wi.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[l]),e.clear(),this.fsQuad.render(e),o=this.renderTargetsVertical[l];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(n),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=s}getSeperableBlurMaterial(e){const t=[];for(let n=0;n<e;n++)t.push(.39894*Math.exp(-.5*n*n/(e*e))/e);return new ht({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new _e(.5,.5)},direction:{value:new _e(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(e){return new ht({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}}Wi.BlurDirectionX=new _e(1,0),Wi.BlurDirectionY=new _e(0,1);const Np={name:"GammaCorrectionShader",uniforms:{tDiffuse:{value:null}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 tex = texture2D( tDiffuse, vUv );

			gl_FragColor = sRGBTransferOETF( tex );

		}`},ba={name:"SMAAEdgesShader",defines:{SMAA_THRESHOLD:"0.1"},uniforms:{tDiffuse:{value:null},resolution:{value:new _e(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];

		void SMAAEdgeDetectionVS( vec2 texcoord ) {
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -1.0, 0.0, 0.0,  1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4(  1.0, 0.0, 0.0, -1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 2 ] = texcoord.xyxy + resolution.xyxy * vec4( -2.0, 0.0, 0.0,  2.0 ); // WebGL port note: Changed sign in W component
		}

		void main() {

			vUv = uv;

			SMAAEdgeDetectionVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];

		vec4 SMAAColorEdgeDetectionPS( vec2 texcoord, vec4 offset[3], sampler2D colorTex ) {
			vec2 threshold = vec2( SMAA_THRESHOLD, SMAA_THRESHOLD );

			// Calculate color deltas:
			vec4 delta;
			vec3 C = texture2D( colorTex, texcoord ).rgb;

			vec3 Cleft = texture2D( colorTex, offset[0].xy ).rgb;
			vec3 t = abs( C - Cleft );
			delta.x = max( max( t.r, t.g ), t.b );

			vec3 Ctop = texture2D( colorTex, offset[0].zw ).rgb;
			t = abs( C - Ctop );
			delta.y = max( max( t.r, t.g ), t.b );

			// We do the usual threshold:
			vec2 edges = step( threshold, delta.xy );

			// Then discard if there is no edge:
			if ( dot( edges, vec2( 1.0, 1.0 ) ) == 0.0 )
				discard;

			// Calculate right and bottom deltas:
			vec3 Cright = texture2D( colorTex, offset[1].xy ).rgb;
			t = abs( C - Cright );
			delta.z = max( max( t.r, t.g ), t.b );

			vec3 Cbottom  = texture2D( colorTex, offset[1].zw ).rgb;
			t = abs( C - Cbottom );
			delta.w = max( max( t.r, t.g ), t.b );

			// Calculate the maximum delta in the direct neighborhood:
			float maxDelta = max( max( max( delta.x, delta.y ), delta.z ), delta.w );

			// Calculate left-left and top-top deltas:
			vec3 Cleftleft  = texture2D( colorTex, offset[2].xy ).rgb;
			t = abs( C - Cleftleft );
			delta.z = max( max( t.r, t.g ), t.b );

			vec3 Ctoptop = texture2D( colorTex, offset[2].zw ).rgb;
			t = abs( C - Ctoptop );
			delta.w = max( max( t.r, t.g ), t.b );

			// Calculate the final maximum delta:
			maxDelta = max( max( maxDelta, delta.z ), delta.w );

			// Local contrast adaptation in action:
			edges.xy *= step( 0.5 * maxDelta, delta.xy );

			return vec4( edges, 0.0, 0.0 );
		}

		void main() {

			gl_FragColor = SMAAColorEdgeDetectionPS( vUv, vOffset, tDiffuse );

		}`},Sa={name:"SMAAWeightsShader",defines:{SMAA_MAX_SEARCH_STEPS:"8",SMAA_AREATEX_MAX_DISTANCE:"16",SMAA_AREATEX_PIXEL_SIZE:"( 1.0 / vec2( 160.0, 560.0 ) )",SMAA_AREATEX_SUBTEX_SIZE:"( 1.0 / 7.0 )"},uniforms:{tDiffuse:{value:null},tArea:{value:null},tSearch:{value:null},resolution:{value:new _e(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 3 ];
		varying vec2 vPixcoord;

		void SMAABlendingWeightCalculationVS( vec2 texcoord ) {
			vPixcoord = texcoord / resolution;

			// We will use these offsets for the searches later on (see @PSEUDO_GATHER4):
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.25, 0.125, 1.25, 0.125 ); // WebGL port note: Changed sign in Y and W components
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.125, 0.25, -0.125, -1.25 ); // WebGL port note: Changed sign in Y and W components

			// And these for the searches, they indicate the ends of the loops:
			vOffset[ 2 ] = vec4( vOffset[ 0 ].xz, vOffset[ 1 ].yw ) + vec4( -2.0, 2.0, -2.0, 2.0 ) * resolution.xxyy * float( SMAA_MAX_SEARCH_STEPS );

		}

		void main() {

			vUv = uv;

			SMAABlendingWeightCalculationVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		#define SMAASampleLevelZeroOffset( tex, coord, offset ) texture2D( tex, coord + float( offset ) * resolution, 0.0 )

		uniform sampler2D tDiffuse;
		uniform sampler2D tArea;
		uniform sampler2D tSearch;
		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[3];
		varying vec2 vPixcoord;

		#if __VERSION__ == 100
		vec2 round( vec2 x ) {
			return sign( x ) * floor( abs( x ) + 0.5 );
		}
		#endif

		float SMAASearchLength( sampler2D searchTex, vec2 e, float bias, float scale ) {
			// Not required if searchTex accesses are set to point:
			// float2 SEARCH_TEX_PIXEL_SIZE = 1.0 / float2(66.0, 33.0);
			// e = float2(bias, 0.0) + 0.5 * SEARCH_TEX_PIXEL_SIZE +
			//     e * float2(scale, 1.0) * float2(64.0, 32.0) * SEARCH_TEX_PIXEL_SIZE;
			e.r = bias + e.r * scale;
			return 255.0 * texture2D( searchTex, e, 0.0 ).r;
		}

		float SMAASearchXLeft( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			/**
				* @PSEUDO_GATHER4
				* This texcoord has been offset by (-0.25, -0.125) in the vertex shader to
				* sample between edge, thus fetching four edges in a row.
				* Sampling with different offsets in each direction allows to disambiguate
				* which edges are active from the four fetched ones.
				*/
			vec2 e = vec2( 0.0, 1.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord -= vec2( 2.0, 0.0 ) * resolution;
				if ( ! ( texcoord.x > end && e.g > 0.8281 && e.r == 0.0 ) ) break;
			}

			// We correct the previous (-0.25, -0.125) offset we applied:
			texcoord.x += 0.25 * resolution.x;

			// The searches are bias by 1, so adjust the coords accordingly:
			texcoord.x += resolution.x;

			// Disambiguate the length added by the last step:
			texcoord.x += 2.0 * resolution.x; // Undo last step
			texcoord.x -= resolution.x * SMAASearchLength(searchTex, e, 0.0, 0.5);

			return texcoord.x;
		}

		float SMAASearchXRight( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 0.0, 1.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord += vec2( 2.0, 0.0 ) * resolution;
				if ( ! ( texcoord.x < end && e.g > 0.8281 && e.r == 0.0 ) ) break;
			}

			texcoord.x -= 0.25 * resolution.x;
			texcoord.x -= resolution.x;
			texcoord.x -= 2.0 * resolution.x;
			texcoord.x += resolution.x * SMAASearchLength( searchTex, e, 0.5, 0.5 );

			return texcoord.x;
		}

		float SMAASearchYUp( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 1.0, 0.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord += vec2( 0.0, 2.0 ) * resolution; // WebGL port note: Changed sign
				if ( ! ( texcoord.y > end && e.r > 0.8281 && e.g == 0.0 ) ) break;
			}

			texcoord.y -= 0.25 * resolution.y; // WebGL port note: Changed sign
			texcoord.y -= resolution.y; // WebGL port note: Changed sign
			texcoord.y -= 2.0 * resolution.y; // WebGL port note: Changed sign
			texcoord.y += resolution.y * SMAASearchLength( searchTex, e.gr, 0.0, 0.5 ); // WebGL port note: Changed sign

			return texcoord.y;
		}

		float SMAASearchYDown( sampler2D edgesTex, sampler2D searchTex, vec2 texcoord, float end ) {
			vec2 e = vec2( 1.0, 0.0 );

			for ( int i = 0; i < SMAA_MAX_SEARCH_STEPS; i ++ ) { // WebGL port note: Changed while to for
				e = texture2D( edgesTex, texcoord, 0.0 ).rg;
				texcoord -= vec2( 0.0, 2.0 ) * resolution; // WebGL port note: Changed sign
				if ( ! ( texcoord.y < end && e.r > 0.8281 && e.g == 0.0 ) ) break;
			}

			texcoord.y += 0.25 * resolution.y; // WebGL port note: Changed sign
			texcoord.y += resolution.y; // WebGL port note: Changed sign
			texcoord.y += 2.0 * resolution.y; // WebGL port note: Changed sign
			texcoord.y -= resolution.y * SMAASearchLength( searchTex, e.gr, 0.5, 0.5 ); // WebGL port note: Changed sign

			return texcoord.y;
		}

		vec2 SMAAArea( sampler2D areaTex, vec2 dist, float e1, float e2, float offset ) {
			// Rounding prevents precision errors of bilinear filtering:
			vec2 texcoord = float( SMAA_AREATEX_MAX_DISTANCE ) * round( 4.0 * vec2( e1, e2 ) ) + dist;

			// We do a scale and bias for mapping to texel space:
			texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + ( 0.5 * SMAA_AREATEX_PIXEL_SIZE );

			// Move to proper place, according to the subpixel offset:
			texcoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

			return texture2D( areaTex, texcoord, 0.0 ).rg;
		}

		vec4 SMAABlendingWeightCalculationPS( vec2 texcoord, vec2 pixcoord, vec4 offset[ 3 ], sampler2D edgesTex, sampler2D areaTex, sampler2D searchTex, ivec4 subsampleIndices ) {
			vec4 weights = vec4( 0.0, 0.0, 0.0, 0.0 );

			vec2 e = texture2D( edgesTex, texcoord ).rg;

			if ( e.g > 0.0 ) { // Edge at north
				vec2 d;

				// Find the distance to the left:
				vec2 coords;
				coords.x = SMAASearchXLeft( edgesTex, searchTex, offset[ 0 ].xy, offset[ 2 ].x );
				coords.y = offset[ 1 ].y; // offset[1].y = texcoord.y - 0.25 * resolution.y (@CROSSING_OFFSET)
				d.x = coords.x;

				// Now fetch the left crossing edges, two at a time using bilinear
				// filtering. Sampling at -0.25 (see @CROSSING_OFFSET) enables to
				// discern what value each edge has:
				float e1 = texture2D( edgesTex, coords, 0.0 ).r;

				// Find the distance to the right:
				coords.x = SMAASearchXRight( edgesTex, searchTex, offset[ 0 ].zw, offset[ 2 ].y );
				d.y = coords.x;

				// We want the distances to be in pixel units (doing this here allow to
				// better interleave arithmetic and memory accesses):
				d = d / resolution.x - pixcoord.x;

				// SMAAArea below needs a sqrt, as the areas texture is compressed
				// quadratically:
				vec2 sqrt_d = sqrt( abs( d ) );

				// Fetch the right crossing edges:
				coords.y -= 1.0 * resolution.y; // WebGL port note: Added
				float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 1, 0 ) ).r;

				// Ok, we know how this pattern looks like, now it is time for getting
				// the actual area:
				weights.rg = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.y ) );
			}

			if ( e.r > 0.0 ) { // Edge at west
				vec2 d;

				// Find the distance to the top:
				vec2 coords;

				coords.y = SMAASearchYUp( edgesTex, searchTex, offset[ 1 ].xy, offset[ 2 ].z );
				coords.x = offset[ 0 ].x; // offset[1].x = texcoord.x - 0.25 * resolution.x;
				d.x = coords.y;

				// Fetch the top crossing edges:
				float e1 = texture2D( edgesTex, coords, 0.0 ).g;

				// Find the distance to the bottom:
				coords.y = SMAASearchYDown( edgesTex, searchTex, offset[ 1 ].zw, offset[ 2 ].w );
				d.y = coords.y;

				// We want the distances to be in pixel units:
				d = d / resolution.y - pixcoord.y;

				// SMAAArea below needs a sqrt, as the areas texture is compressed
				// quadratically:
				vec2 sqrt_d = sqrt( abs( d ) );

				// Fetch the bottom crossing edges:
				coords.y -= 1.0 * resolution.y; // WebGL port note: Added
				float e2 = SMAASampleLevelZeroOffset( edgesTex, coords, ivec2( 0, 1 ) ).g;

				// Get the area for this direction:
				weights.ba = SMAAArea( areaTex, sqrt_d, e1, e2, float( subsampleIndices.x ) );
			}

			return weights;
		}

		void main() {

			gl_FragColor = SMAABlendingWeightCalculationPS( vUv, vPixcoord, vOffset, tDiffuse, tArea, tSearch, ivec4( 0.0 ) );

		}`},Bs={name:"SMAABlendShader",uniforms:{tDiffuse:{value:null},tColor:{value:null},resolution:{value:new _e(1/1024,1/512)}},vertexShader:`

		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 2 ];

		void SMAANeighborhoodBlendingVS( vec2 texcoord ) {
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -1.0, 0.0, 0.0, 1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4( 1.0, 0.0, 0.0, -1.0 ); // WebGL port note: Changed sign in W component
		}

		void main() {

			vUv = uv;

			SMAANeighborhoodBlendingVS( vUv );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform sampler2D tColor;
		uniform vec2 resolution;

		varying vec2 vUv;
		varying vec4 vOffset[ 2 ];

		vec4 SMAANeighborhoodBlendingPS( vec2 texcoord, vec4 offset[ 2 ], sampler2D colorTex, sampler2D blendTex ) {
			// Fetch the blending weights for current pixel:
			vec4 a;
			a.xz = texture2D( blendTex, texcoord ).xz;
			a.y = texture2D( blendTex, offset[ 1 ].zw ).g;
			a.w = texture2D( blendTex, offset[ 1 ].xy ).a;

			// Is there any blending weight with a value greater than 0.0?
			if ( dot(a, vec4( 1.0, 1.0, 1.0, 1.0 )) < 1e-5 ) {
				return texture2D( colorTex, texcoord, 0.0 );
			} else {
				// Up to 4 lines can be crossing a pixel (one through each edge). We
				// favor blending by choosing the line with the maximum weight for each
				// direction:
				vec2 offset;
				offset.x = a.a > a.b ? a.a : -a.b; // left vs. right
				offset.y = a.g > a.r ? -a.g : a.r; // top vs. bottom // WebGL port note: Changed signs

				// Then we go in the direction that has the maximum weight:
				if ( abs( offset.x ) > abs( offset.y )) { // horizontal vs. vertical
					offset.y = 0.0;
				} else {
					offset.x = 0.0;
				}

				// Fetch the opposite color and lerp by hand:
				vec4 C = texture2D( colorTex, texcoord, 0.0 );
				texcoord += sign( offset ) * resolution;
				vec4 Cop = texture2D( colorTex, texcoord, 0.0 );
				float s = abs( offset.x ) > abs( offset.y ) ? abs( offset.x ) : abs( offset.y );

				// WebGL port note: Added gamma correction
				C.xyz = pow(C.xyz, vec3(2.2));
				Cop.xyz = pow(Cop.xyz, vec3(2.2));
				vec4 mixed = mix(C, Cop, s);
				mixed.xyz = pow(mixed.xyz, vec3(1.0 / 2.2));

				return mixed;
			}
		}

		void main() {

			gl_FragColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );

		}`};class Op extends Gi{constructor(e,t){super(),this.edgesRT=new Tt(e,t,{depthBuffer:!1,type:rn}),this.edgesRT.texture.name="SMAAPass.edges",this.weightsRT=new Tt(e,t,{depthBuffer:!1,type:rn}),this.weightsRT.texture.name="SMAAPass.weights";const n=this,i=new Image;i.src=this.getAreaTexture(),i.onload=function(){n.areaTexture.needsUpdate=!0},this.areaTexture=new nt,this.areaTexture.name="SMAAPass.area",this.areaTexture.image=i,this.areaTexture.minFilter=Ut,this.areaTexture.generateMipmaps=!1,this.areaTexture.flipY=!1;const a=new Image;a.src=this.getSearchTexture(),a.onload=function(){n.searchTexture.needsUpdate=!0},this.searchTexture=new nt,this.searchTexture.name="SMAAPass.search",this.searchTexture.image=a,this.searchTexture.magFilter=ut,this.searchTexture.minFilter=ut,this.searchTexture.generateMipmaps=!1,this.searchTexture.flipY=!1,this.uniformsEdges=Kn.clone(ba.uniforms),this.uniformsEdges.resolution.value.set(1/e,1/t),this.materialEdges=new ht({defines:Object.assign({},ba.defines),uniforms:this.uniformsEdges,vertexShader:ba.vertexShader,fragmentShader:ba.fragmentShader}),this.uniformsWeights=Kn.clone(Sa.uniforms),this.uniformsWeights.resolution.value.set(1/e,1/t),this.uniformsWeights.tDiffuse.value=this.edgesRT.texture,this.uniformsWeights.tArea.value=this.areaTexture,this.uniformsWeights.tSearch.value=this.searchTexture,this.materialWeights=new ht({defines:Object.assign({},Sa.defines),uniforms:this.uniformsWeights,vertexShader:Sa.vertexShader,fragmentShader:Sa.fragmentShader}),this.uniformsBlend=Kn.clone(Bs.uniforms),this.uniformsBlend.resolution.value.set(1/e,1/t),this.uniformsBlend.tDiffuse.value=this.weightsRT.texture,this.materialBlend=new ht({uniforms:this.uniformsBlend,vertexShader:Bs.vertexShader,fragmentShader:Bs.fragmentShader}),this.fsQuad=new Fs(null)}render(e,t,n){this.uniformsEdges.tDiffuse.value=n.texture,this.fsQuad.material=this.materialEdges,e.setRenderTarget(this.edgesRT),this.clear&&e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.materialWeights,e.setRenderTarget(this.weightsRT),this.clear&&e.clear(),this.fsQuad.render(e),this.uniformsBlend.tColor.value=n.texture,this.fsQuad.material=this.materialBlend,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(),this.fsQuad.render(e))}setSize(e,t){this.edgesRT.setSize(e,t),this.weightsRT.setSize(e,t),this.materialEdges.uniforms.resolution.value.set(1/e,1/t),this.materialWeights.uniforms.resolution.value.set(1/e,1/t),this.materialBlend.uniforms.resolution.value.set(1/e,1/t)}getAreaTexture(){return"data:image/png;base64,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"}getSearchTexture(){return"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEIAAAAhCAAAAABIXyLAAAAAOElEQVRIx2NgGAWjYBSMglEwEICREYRgFBZBqDCSLA2MGPUIVQETE9iNUAqLR5gIeoQKRgwXjwAAGn4AtaFeYLEAAAAASUVORK5CYII="}dispose(){this.edgesRT.dispose(),this.weightsRT.dispose(),this.areaTexture.dispose(),this.searchTexture.dispose(),this.materialEdges.dispose(),this.materialWeights.dispose(),this.materialBlend.dispose(),this.fsQuad.dispose()}}const ee={fftSize:4096,audioReader:null,gain:null,essentiaNode:null,soundGainNode:null,audioCtx:null,sound:null,micSound:null,capacity:5,analyser:null,micAnalyser:null,micNode:null,gumStream:null,listener:null};function Fp(){ee.micAnalyser&&ee.micAnalyser.getFrequencyData().some(r=>r>0)}let zs=!1;function Bp(r){const e=document.getElementById("audioInput"),t=document.getElementById("fileName"),n=document.getElementById("playPauseButton"),i=document.getElementById("stopButton"),a=document.getElementById("micMode");e.addEventListener("change",s=>{if(s.target.files.length>0){const o=s.target.files[0];t.textContent=o.name,function(l,c,u){ee.sound.started===!0?(ee.sound.stop(),ee.sound.setBuffer(null),u.textContent="Play",ee.sound.started=!1):ee.sound.started||u.textContent==="Play"||(ee.sound.setBuffer(null),u.textContent="Play"),zs=!1,c.load(l,function(h){ee.sound.setBuffer(h),ee.sound.setLoop(!1),ee.sound.setVolume(.5),zs=!0},void 0,h=>{})}(URL.createObjectURL(o),r,n)}else t.textContent="Choose File";ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying})}),a.addEventListener("click",()=>{ee.gumStream&&ee.gumStream.active?(ee.gumStream&&(ee.gumStream.getAudioTracks().forEach(s=>{s.stop()}),ee.micNode.disconnect(),ee.micAnalyser=null,ee.gumStream=null,ee.micSound=null),ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying,micActive:ee.gumStream&&ee.gumStream.active}),a.textContent="Mic"):(navigator.mediaDevices.getUserMedia&&navigator.mediaDevices.getUserMedia({audio:!0}).then(s=>{ee.gumStream=s,ee.micSound=new Bl(ee.listener),ee.micNode=ee.audioCtx.createMediaStreamSource(ee.gumStream),ee.micSound.setNodeSource(ee.micNode),ee.micSound.getOutput().disconnect(),ee.micAnalyser=new zl(ee.micSound,ee.fftSize);const o=ee.audioCtx.createGain();o.gain.setValueAtTime(0,ee.audioCtx.currentTime),ee.micSound.getOutput().connect(ee.essentiaNode).connect(o).connect(ee.audioCtx.destination),ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying,micActive:ee.gumStream&&ee.gumStream.active}),setInterval(Fp,1e3)}).catch(s=>{}),a.textContent="Stop Mic")}),n.addEventListener("click",()=>{ee.sound.isPlaying?(ee.sound.pause(),n.textContent="Play"):!ee.sound.isPlaying&&zs&&(ee.audioCtx.state==="suspended"?ee.audioCtx.resume().then(()=>{ee.sound.play(),ee.sound.started=!0,n.textContent="Pause"}).catch(s=>{}):(ee.sound.play(),ee.sound.started=!0,n.textContent="Pause")),ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying})}),i.addEventListener("click",()=>{ee.sound.stop(),ee.sound.started=!1,n.textContent="Play",ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying})}),ee.sound.onEnded=function(){ee.sound.stop(),ee.sound.started=!1,n.textContent="Replay",ee.essentiaNode.port.postMessage({isPlaying:ee.sound.isPlaying})}}function zp(){let r=0,e=[],t=0,n=0,i=[],a=[];const s=ee.sound.isPlaying,o=ee.gumStream&&ee.gumStream.active;var l;return s&&(t=ee.analyser.getAverageFrequency(),i=ee.analyser.getFrequencyData()),o&&(n=ee.micAnalyser.getAverageFrequency(),a=ee.micAnalyser.getFrequencyData()),s&&o?(r=Math.sqrt(t*t+n*n),l=a,e=i.map((c,u)=>Math.sqrt(c*c+l[u]*l[u]))):s?(r=t,e=Array.from(i)):o&&(r=n,e=Array.from(a)),{avgAmplitude:r,freqData:e}}async function kp(){return async function(r){const e=r.map(async a=>(await fetch(a)).text()),t=await Promise.all(e);t.unshift("var exports = {};");const n=t.join(""),i=new Blob([n],{type:"application/javascript"});return URL.createObjectURL(i)}(["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js","https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js","./src/audio/audio-data-processor.js","https://unpkg.com/ringbuf.js@0.1.0/dist/index.js"]).then(r=>ee.audioCtx.audioWorklet.addModule(r)).catch(r=>{throw new Error(r)})}class Vp{constructor(e,t,n){this.variables=[],this.currentTextureIndex=0;let i=It;const a=new cl,s=new es;s.position.z=1;const o={passThruTexture:{value:null}},l=h(`uniform sampler2D passThruTexture;

void main() {

	vec2 uv = gl_FragCoord.xy / resolution.xy;

	gl_FragColor = texture2D( passThruTexture, uv );

}
`,o),c=new at(new cn(2,2),l);function u(d){d.defines.resolution="vec2( "+e.toFixed(1)+", "+t.toFixed(1)+" )"}function h(d,p){const v=new ht({name:"GPUComputationShader",uniforms:p=p||{},vertexShader:`void main()	{

	gl_Position = vec4( position, 1.0 );

}
`,fragmentShader:d});return u(v),v}a.add(c),this.setDataType=function(d){return i=d,this},this.addVariable=function(d,p,v){const x={name:d,initialValueTexture:v,material:this.createShaderMaterial(p),dependencies:null,renderTargets:[],wrapS:null,wrapT:null,minFilter:ut,magFilter:ut};return this.variables.push(x),x},this.setVariableDependencies=function(d,p){d.dependencies=p},this.init=function(){if(n.capabilities.maxVertexTextures===0)return"No support for vertex shader textures.";for(let d=0;d<this.variables.length;d++){const p=this.variables[d];p.renderTargets[0]=this.createRenderTarget(e,t,p.wrapS,p.wrapT,p.minFilter,p.magFilter),p.renderTargets[1]=this.createRenderTarget(e,t,p.wrapS,p.wrapT,p.minFilter,p.magFilter),this.renderTexture(p.initialValueTexture,p.renderTargets[0]),this.renderTexture(p.initialValueTexture,p.renderTargets[1]);const v=p.material,x=v.uniforms;if(p.dependencies!==null)for(let f=0;f<p.dependencies.length;f++){const _=p.dependencies[f];if(_.name!==p.name){let m=!1;for(let b=0;b<this.variables.length;b++)if(_.name===this.variables[b].name){m=!0;break}if(!m)return"Variable dependency not found. Variable="+p.name+", dependency="+_.name}x[_.name]={value:null},v.fragmentShader=`
uniform sampler2D `+_.name+`;
`+v.fragmentShader}}return this.currentTextureIndex=0,null},this.compute=function(){const d=this.currentTextureIndex,p=this.currentTextureIndex===0?1:0;for(let v=0,x=this.variables.length;v<x;v++){const f=this.variables[v];if(f.dependencies!==null){const _=f.material.uniforms;for(let m=0,b=f.dependencies.length;m<b;m++){const P=f.dependencies[m];_[P.name].value=P.renderTargets[d].texture}}this.doRenderTarget(f.material,f.renderTargets[p])}this.currentTextureIndex=p},this.getCurrentRenderTarget=function(d){return d.renderTargets[this.currentTextureIndex]},this.getAlternateRenderTarget=function(d){return d.renderTargets[this.currentTextureIndex===0?1:0]},this.dispose=function(){c.geometry.dispose(),c.material.dispose();const d=this.variables;for(let p=0;p<d.length;p++){const v=d[p];v.initialValueTexture&&v.initialValueTexture.dispose();const x=v.renderTargets;for(let f=0;f<x.length;f++)x[f].dispose()}},this.addResolutionDefine=u,this.createShaderMaterial=h,this.createRenderTarget=function(d,p,v,x,f,_){return new Tt(d=d||e,p=p||t,{wrapS:v=v||Cn,wrapT:x=x||Cn,minFilter:f=f||ut,magFilter:_=_||ut,format:qt,type:i,depthBuffer:!1})},this.createTexture=function(){const d=new Float32Array(e*t*4),p=new hr(d,e,t,qt,It);return p.needsUpdate=!0,p},this.renderTexture=function(d,p){o.passThruTexture.value=d,this.doRenderTarget(l,p),o.passThruTexture.value=null},this.doRenderTarget=function(d,p){const v=n.getRenderTarget(),x=n.xr.enabled,f=n.shadowMap.autoUpdate;n.xr.enabled=!1,n.shadowMap.autoUpdate=!1,c.material=d,n.setRenderTarget(p),n.render(a,s),c.material=l,n.xr.enabled=x,n.shadowMap.autoUpdate=f,n.setRenderTarget(v)}}}var Je=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function Hp(r){return r&&r.__esModule&&Object.prototype.hasOwnProperty.call(r,"default")?r.default:r}var ec={exports:{}};(function(r){function e(E,g){if(!E)throw"First parameter is required.";g=new t(E,g=g||{type:"video"});var T=this;function U(y){y&&(g.initCallback=function(){y(),y=g.initCallback=null});var N=new n(E,g);(L=new N(E,g)).record(),S("recording"),g.disableLogs}function C(y){if(y=y||function(){},L){if(T.state==="paused")return T.resumeRecording(),void setTimeout(function(){C(y)},1);T.state!=="recording"&&g.disableLogs,g.disableLogs,g.type!=="gif"?L.stop(N):(L.stop(),N()),S("stopped")}else R();function N(w){if(L){Object.keys(L).forEach(function(ne){typeof L[ne]!="function"&&(T[ne]=L[ne])});var V=L.blob;if(!V){if(!w)throw"Recording failed.";L.blob=V=w}if(V&&g.disableLogs,y){var B;try{B=u.createObjectURL(V)}catch{}typeof y.call=="function"?y.call(T,B):y(B)}g.autoWriteToDisk&&k(function(ne){var oe={};oe[g.type+"Blob"]=ne,se.Store(oe)})}else typeof y.call=="function"?y.call(T,""):y("")}}function W(y){postMessage(new FileReaderSync().readAsDataURL(y))}function k(y,N){if(!y)throw"Pass a callback function over getDataURL.";var w=N?N.blob:(L||{}).blob;if(!w)return g.disableLogs,void setTimeout(function(){k(y,N)},1e3);if(typeof Worker>"u"||navigator.mozGetUserMedia){var V=new FileReader;V.readAsDataURL(w),V.onload=function(ne){y(ne.target.result)}}else{var B=function(ne){try{var oe=u.createObjectURL(new Blob([ne.toString(),"this.onmessage =  function (eee) {"+ne.name+"(eee.data);}"],{type:"application/javascript"})),O=new Worker(oe);return u.revokeObjectURL(oe),O}catch{}}(W);B.onmessage=function(ne){y(ne.data)},B.postMessage(w)}}function M(y){y=y||0,T.state!=="paused"?T.state!=="stopped"&&(y>=T.recordingDuration?C(T.onRecordingStopped):(y+=1e3,setTimeout(function(){M(y)},1e3))):setTimeout(function(){M(y)},1e3)}function S(y){T&&(T.state=y,typeof T.onStateChanged.call=="function"?T.onStateChanged.call(T,y):T.onStateChanged(y))}var L;g.type;function R(){g.disableLogs}var I={startRecording:function(y){return g.disableLogs,y&&(g=new t(E,y)),g.disableLogs,L?(L.clearRecordedData(),L.record(),S("recording"),T.recordingDuration&&M(),T):(U(function(){T.recordingDuration&&M()}),T)},stopRecording:C,pauseRecording:function(){L?(T.state==="recording"&&(S("paused"),L.pause()),g.disableLogs):R()},resumeRecording:function(){L?(T.state==="paused"&&(S("recording"),L.resume()),g.disableLogs):R()},initRecorder:U,setRecordingDuration:function(y,N){if(y===void 0)throw"recordingDuration is required.";if(typeof y!="number")throw"recordingDuration must be a number.";return T.recordingDuration=y,T.onRecordingStopped=N||function(){},{onRecordingStopped:function(w){T.onRecordingStopped=w}}},clearRecordedData:function(){L?(L.clearRecordedData(),g.disableLogs):R()},getBlob:function(){if(L)return L.blob;R()},getDataURL:k,toURL:function(){if(L)return u.createObjectURL(L.blob);R()},getInternalRecorder:function(){return L},save:function(y){L?m(L.blob,y):R()},getFromDisk:function(y){L?e.getFromDisk(g.type,y):R()},setAdvertisementArray:function(y){g.advertisement=[];for(var N=y.length,w=0;w<N;w++)g.advertisement.push({duration:w,image:y[w]})},blob:null,bufferSize:0,sampleRate:0,buffer:null,reset:function(){T.state==="recording"&&g.disableLogs,L&&typeof L.clearRecordedData=="function"&&L.clearRecordedData(),L=null,S("inactive"),T.blob=null},onStateChanged:function(y){g.disableLogs},state:"inactive",getState:function(){return T.state},destroy:function(){var y=g.disableLogs;g={disableLogs:!0},T.reset(),S("destroyed"),I=T=null,D.AudioContextConstructor&&(D.AudioContextConstructor.close(),D.AudioContextConstructor=null),g.disableLogs=y,g.disableLogs},version:"5.6.2"};if(!this)return T=I,I;for(var F in I)this[F]=I[F];return T=this,I}function t(E,g){return g.recorderType||g.type||(g.audio&&g.video?g.type="video":g.audio&&!g.video&&(g.type="audio")),g.recorderType&&!g.type&&(g.recorderType===ae||g.recorderType===K||de!==void 0&&g.recorderType===de?g.type="video":g.recorderType===J?g.type="gif":g.recorderType===j?g.type="audio":g.recorderType===X&&(P(E,"audio").length&&P(E,"video").length||!P(E,"audio").length&&P(E,"video").length?g.type="video":P(E,"audio").length&&!P(E,"video").length&&(g.type="audio"))),X!==void 0&&typeof MediaRecorder<"u"&&"requestData"in MediaRecorder.prototype&&(g.mimeType||(g.mimeType="video/webm"),g.type||(g.type=g.mimeType.split("/")[0]),g.bitsPerSecond),g.type||(g.mimeType&&(g.type=g.mimeType.split("/")[0]),g.type||(g.type="audio")),g}function n(E,g){var T;return(v||h||d)&&(T=j),typeof MediaRecorder<"u"&&"requestData"in MediaRecorder.prototype&&!v&&(T=X),g.type==="video"&&(v||d)&&(T=ae,de!==void 0&&typeof ReadableStream<"u"&&(T=de)),g.type==="gif"&&(T=J),g.type==="canvas"&&(T=K),G()&&T!==K&&T!==J&&typeof MediaRecorder<"u"&&"requestData"in MediaRecorder.prototype&&(P(E,"video").length||P(E,"audio").length)&&(g.type==="audio"?typeof MediaRecorder.isTypeSupported=="function"&&MediaRecorder.isTypeSupported("audio/webm")&&(T=X):typeof MediaRecorder.isTypeSupported=="function"&&MediaRecorder.isTypeSupported("video/webm")&&(T=X)),E instanceof Array&&E.length&&(T=re),g.recorderType&&(T=g.recorderType),!g.disableLogs&&T&&T.name,!T&&x&&(T=X),T}function i(E){this.addStream=function(g){g&&(E=g)},this.mediaType={audio:!0,video:!0},this.startRecording=function(){var g,T=this.mediaType,U=this.mimeType||{audio:null,video:null,gif:null};if(typeof T.audio!="function"&&G()&&!P(E,"audio").length&&(T.audio=!1),typeof T.video!="function"&&G()&&!P(E,"video").length&&(T.video=!1),typeof T.gif!="function"&&G()&&!P(E,"video").length&&(T.gif=!1),!T.audio&&!T.video&&!T.gif)throw"MediaStream must have either audio or video tracks.";if(T.audio&&(g=null,typeof T.audio=="function"&&(g=T.audio),this.audioRecorder=new e(E,{type:"audio",bufferSize:this.bufferSize,sampleRate:this.sampleRate,numberOfAudioChannels:this.numberOfAudioChannels||2,disableLogs:this.disableLogs,recorderType:g,mimeType:U.audio,timeSlice:this.timeSlice,onTimeStamp:this.onTimeStamp}),T.video||this.audioRecorder.startRecording()),T.video){g=null,typeof T.video=="function"&&(g=T.video);var C=E;if(G()&&T.audio&&typeof T.audio=="function"){var W=P(E,"video")[0];p?((C=new f).addTrack(W),g&&g===ae&&(g=X)):(C=new f).addTrack(W)}this.videoRecorder=new e(C,{type:"video",video:this.video,canvas:this.canvas,frameInterval:this.frameInterval||10,disableLogs:this.disableLogs,recorderType:g,mimeType:U.video,timeSlice:this.timeSlice,onTimeStamp:this.onTimeStamp,workerPath:this.workerPath,webAssemblyPath:this.webAssemblyPath,frameRate:this.frameRate,bitrate:this.bitrate}),T.audio||this.videoRecorder.startRecording()}if(T.audio&&T.video){var k=this,M=G()===!0;(T.audio instanceof j&&T.video||T.audio!==!0&&T.video!==!0&&T.audio!==T.video)&&(M=!1),M===!0?(k.audioRecorder=null,k.videoRecorder.startRecording()):k.videoRecorder.initRecorder(function(){k.audioRecorder.initRecorder(function(){k.videoRecorder.startRecording(),k.audioRecorder.startRecording()})})}T.gif&&(g=null,typeof T.gif=="function"&&(g=T.gif),this.gifRecorder=new e(E,{type:"gif",frameRate:this.frameRate||200,quality:this.quality||10,disableLogs:this.disableLogs,recorderType:g,mimeType:U.gif}),this.gifRecorder.startRecording())},this.stopRecording=function(g){g=g||function(){},this.audioRecorder&&this.audioRecorder.stopRecording(function(T){g(T,"audio")}),this.videoRecorder&&this.videoRecorder.stopRecording(function(T){g(T,"video")}),this.gifRecorder&&this.gifRecorder.stopRecording(function(T){g(T,"gif")})},this.pauseRecording=function(){this.audioRecorder&&this.audioRecorder.pauseRecording(),this.videoRecorder&&this.videoRecorder.pauseRecording(),this.gifRecorder&&this.gifRecorder.pauseRecording()},this.resumeRecording=function(){this.audioRecorder&&this.audioRecorder.resumeRecording(),this.videoRecorder&&this.videoRecorder.resumeRecording(),this.gifRecorder&&this.gifRecorder.resumeRecording()},this.getBlob=function(g){var T={};return this.audioRecorder&&(T.audio=this.audioRecorder.getBlob()),this.videoRecorder&&(T.video=this.videoRecorder.getBlob()),this.gifRecorder&&(T.gif=this.gifRecorder.getBlob()),g&&g(T),T},this.destroy=function(){this.audioRecorder&&(this.audioRecorder.destroy(),this.audioRecorder=null),this.videoRecorder&&(this.videoRecorder.destroy(),this.videoRecorder=null),this.gifRecorder&&(this.gifRecorder.destroy(),this.gifRecorder=null)},this.getDataURL=function(g){function T(U,C){if(typeof Worker<"u"){var W=function(M){var S,L=u.createObjectURL(new Blob([M.toString(),"this.onmessage =  function (eee) {"+M.name+"(eee.data);}"],{type:"application/javascript"})),R=new Worker(L);if(u!==void 0)S=u;else{if(typeof webkitURL>"u")throw"Neither URL nor webkitURL detected.";S=webkitURL}return S.revokeObjectURL(L),R}(function(M){postMessage(new FileReaderSync().readAsDataURL(M))});W.onmessage=function(M){C(M.data)},W.postMessage(U)}else{var k=new FileReader;k.readAsDataURL(U),k.onload=function(M){C(M.target.result)}}}this.getBlob(function(U){U.audio&&U.video?T(U.audio,function(C){T(U.video,function(W){g({audio:C,video:W})})}):U.audio?T(U.audio,function(C){g({audio:C})}):U.video&&T(U.video,function(C){g({video:C})})})},this.writeToDisk=function(){e.writeToDisk({audio:this.audioRecorder,video:this.videoRecorder,gif:this.gifRecorder})},this.save=function(g){(g=g||{audio:!0,video:!0,gif:!0}).audio&&this.audioRecorder&&this.audioRecorder.save(typeof g.audio=="string"?g.audio:""),g.video&&this.videoRecorder&&this.videoRecorder.save(typeof g.video=="string"?g.video:""),g.gif&&this.gifRecorder&&this.gifRecorder.save(typeof g.gif=="string"?g.gif:"")}}e.version="5.6.2",r.exports=e,e.getFromDisk=function(E,g){if(!g)throw"callback is mandatory.";se.Fetch(function(T,U){E!=="all"&&U===E+"Blob"&&g&&g(T),E==="all"&&g&&g(T,U.replace("Blob",""))})},e.writeToDisk=function(E){(E=E||{}).audio&&E.video&&E.gif?E.audio.getDataURL(function(g){E.video.getDataURL(function(T){E.gif.getDataURL(function(U){se.Store({audioBlob:g,videoBlob:T,gifBlob:U})})})}):E.audio&&E.video?E.audio.getDataURL(function(g){E.video.getDataURL(function(T){se.Store({audioBlob:g,videoBlob:T})})}):E.audio&&E.gif?E.audio.getDataURL(function(g){E.gif.getDataURL(function(T){se.Store({audioBlob:g,gifBlob:T})})}):E.video&&E.gif?E.video.getDataURL(function(g){E.gif.getDataURL(function(T){se.Store({videoBlob:g,gifBlob:T})})}):E.audio?E.audio.getDataURL(function(g){se.Store({audioBlob:g})}):E.video?E.video.getDataURL(function(g){se.Store({videoBlob:g})}):E.gif&&E.gif.getDataURL(function(g){se.Store({gifBlob:g})})},i.getFromDisk=e.getFromDisk,i.writeToDisk=e.writeToDisk,e!==void 0&&(e.MRecordRTC=i);var a;(a=Je!==void 0?Je:null)&&typeof window>"u"&&Je!==void 0&&(Je.navigator={userAgent:"Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45",getUserMedia:function(){}},Je.console||(Je.console={}),Je.console.log!==void 0&&Je.console.error!==void 0||(Je.console.error=Je.console.log=Je.console.log||function(){}),typeof document>"u"&&(a.document={documentElement:{appendChild:function(){return""}}},document.createElement=document.captureStream=document.mozCaptureStream=function(){var E={getContext:function(){return E},play:function(){},pause:function(){},drawImage:function(){},toDataURL:function(){return""},style:{}};return E},a.HTMLVideoElement=function(){}),typeof location>"u"&&(a.location={protocol:"file:",href:"",hash:""}),typeof screen>"u"&&(a.screen={width:0,height:0}),u===void 0&&(a.URL={createObjectURL:function(){return""},revokeObjectURL:function(){return""}}),a.window=Je);var s=window.requestAnimationFrame;if(s===void 0){if(typeof webkitRequestAnimationFrame<"u")s=webkitRequestAnimationFrame;else if(typeof mozRequestAnimationFrame<"u")s=mozRequestAnimationFrame;else if(typeof msRequestAnimationFrame<"u")s=msRequestAnimationFrame;else if(s===void 0){var o=0;s=function(E,g){var T=new Date().getTime(),U=Math.max(0,16-(T-o)),C=setTimeout(function(){E(T+U)},U);return o=T+U,C}}}var l=window.cancelAnimationFrame;l===void 0&&(typeof webkitCancelAnimationFrame<"u"?l=webkitCancelAnimationFrame:typeof mozCancelAnimationFrame<"u"?l=mozCancelAnimationFrame:typeof msCancelAnimationFrame<"u"?l=msCancelAnimationFrame:l===void 0&&(l=function(E){clearTimeout(E)}));var c=window.AudioContext;c===void 0&&(typeof webkitAudioContext<"u"&&(c=webkitAudioContext),typeof mozAudioContext<"u"&&(c=mozAudioContext));var u=window.URL;u===void 0&&typeof webkitURL<"u"&&(u=webkitURL),typeof navigator<"u"&&navigator.getUserMedia===void 0&&(navigator.webkitGetUserMedia!==void 0&&(navigator.getUserMedia=navigator.webkitGetUserMedia),navigator.mozGetUserMedia!==void 0&&(navigator.getUserMedia=navigator.mozGetUserMedia));var h=!(navigator.userAgent.indexOf("Edge")===-1||!navigator.msSaveBlob&&!navigator.msSaveOrOpenBlob),d=!!window.opera||navigator.userAgent.indexOf("OPR/")!==-1,p=navigator.userAgent.toLowerCase().indexOf("firefox")>-1&&"netscape"in window&&/ rv:/.test(navigator.userAgent),v=!d&&!h&&!!navigator.webkitGetUserMedia||b()||navigator.userAgent.toLowerCase().indexOf("chrome/")!==-1,x=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);x&&!v&&navigator.userAgent.indexOf("CriOS")!==-1&&(x=!1,v=!0);var f=window.MediaStream;function _(E){if(E===0)return"0 Bytes";var g=parseInt(Math.floor(Math.log(E)/Math.log(1e3)),10);return(E/Math.pow(1e3,g)).toPrecision(3)+" "+["Bytes","KB","MB","GB","TB"][g]}function m(E,g){if(!E)throw"Blob object is required.";if(!E.type)try{E.type="video/webm"}catch{}var T=(E.type||"video/webm").split("/")[1];if(T.indexOf(";")!==-1&&(T=T.split(";")[0]),g&&g.indexOf(".")!==-1){var U=g.split(".");g=U[0],T=U[1]}var C=(g||Math.round(9999999999*Math.random())+888888888)+"."+T;if(navigator.msSaveOrOpenBlob!==void 0)return navigator.msSaveOrOpenBlob(E,C);if(navigator.msSaveBlob!==void 0)return navigator.msSaveBlob(E,C);var W=document.createElement("a");W.href=u.createObjectURL(E),W.download=C,W.style="display:none;opacity:0;color:transparent;",(document.body||document.documentElement).appendChild(W),typeof W.click=="function"?W.click():(W.target="_blank",W.dispatchEvent(new MouseEvent("click",{view:window,bubbles:!0,cancelable:!0}))),u.revokeObjectURL(W.href)}function b(){return typeof window<"u"&&typeof window.process=="object"&&window.process.type==="renderer"||!(typeof process>"u"||typeof process.versions!="object"||!process.versions.electron)||typeof navigator=="object"&&typeof navigator.userAgent=="string"&&navigator.userAgent.indexOf("Electron")>=0}function P(E,g){return E&&E.getTracks?E.getTracks().filter(function(T){return T.kind===(g||"audio")}):[]}function Y(E,g){"srcObject"in g?g.srcObject=E:"mozSrcObject"in g?g.mozSrcObject=E:g.srcObject=E}f===void 0&&typeof webkitMediaStream<"u"&&(f=webkitMediaStream),f!==void 0&&f.prototype.stop===void 0&&(f.prototype.stop=function(){this.getTracks().forEach(function(E){E.stop()})}),e!==void 0&&(e.invokeSaveAsDialog=m,e.getTracks=P,e.getSeekableBlob=function(E,g){if(typeof EBML>"u")throw new Error("Please link: https://www.webrtc-experiment.com/EBML.js");var T=new EBML.Reader,U=new EBML.Decoder,C=EBML.tools,W=new FileReader;W.onload=function(k){U.decode(this.result).forEach(function(R){T.read(R)}),T.stop();var M=C.makeMetadataSeekable(T.metadatas,T.duration,T.cues),S=this.result.slice(T.metadataSize),L=new Blob([M,S],{type:"video/webm"});g(L)},W.readAsArrayBuffer(E)},e.bytesToSize=_,e.isElectron=b);var D={};function G(){if(p||x||h)return!0;var E,g,T=navigator.userAgent,U=""+parseFloat(navigator.appVersion),C=parseInt(navigator.appVersion,10);return(v||d)&&(E=T.indexOf("Chrome"),U=T.substring(E+7)),(g=U.indexOf(";"))!==-1&&(U=U.substring(0,g)),(g=U.indexOf(" "))!==-1&&(U=U.substring(0,g)),C=parseInt(""+U,10),isNaN(C)&&(U=""+parseFloat(navigator.appVersion),C=parseInt(navigator.appVersion,10)),C>=49}function X(E,g){var T=this;if(E===void 0)throw'First argument "MediaStream" is required.';if(typeof MediaRecorder>"u")throw"Your browser does not support the Media Recorder API. Please try other modules e.g. WhammyRecorder or StereoAudioRecorder.";if((g=g||{mimeType:"video/webm"}).type==="audio"){var U;P(E,"video").length&&P(E,"audio").length&&(navigator.mozGetUserMedia?(U=new f).addTrack(P(E,"audio")[0]):U=new f(P(E,"audio")),E=U),g.mimeType&&g.mimeType.toString().toLowerCase().indexOf("audio")!==-1||(g.mimeType=v?"audio/webm":"audio/ogg"),g.mimeType&&g.mimeType.toString().toLowerCase()!=="audio/ogg"&&navigator.mozGetUserMedia&&(g.mimeType="audio/ogg")}var C,W=[];function k(){T.timestamps.push(new Date().getTime()),typeof g.onTimeStamp=="function"&&g.onTimeStamp(T.timestamps[T.timestamps.length-1],T.timestamps)}function M(R){return C&&C.mimeType?C.mimeType:R.mimeType||"video/webm"}function S(){W=[],C=null,T.timestamps=[]}this.getArrayOfBlobs=function(){return W},this.record=function(){T.blob=null,T.clearRecordedData(),T.timestamps=[],L=[],W=[];var R=g;g.disableLogs,C&&(C=null),v&&!G()&&(R="video/vp8"),typeof MediaRecorder.isTypeSupported=="function"&&R.mimeType&&(MediaRecorder.isTypeSupported(R.mimeType)||(g.disableLogs,R.mimeType=g.type==="audio"?"audio/webm":"video/webm"));try{C=new MediaRecorder(E,R),g.mimeType=R.mimeType}catch{C=new MediaRecorder(E)}R.mimeType&&!MediaRecorder.isTypeSupported&&"canRecordMimeType"in C&&C.canRecordMimeType(R.mimeType)===!1&&g.disableLogs,C.ondataavailable=function(I){if(I.data&&L.push("ondataavailable: "+_(I.data.size)),typeof g.timeSlice!="number")!I.data||!I.data.size||I.data.size<100||T.blob?T.recordingCallback&&(T.recordingCallback(new Blob([],{type:M(R)})),T.recordingCallback=null):(T.blob=g.getNativeBlob?I.data:new Blob([I.data],{type:M(R)}),T.recordingCallback&&(T.recordingCallback(T.blob),T.recordingCallback=null));else if(I.data&&I.data.size&&(W.push(I.data),k(),typeof g.ondataavailable=="function")){var F=g.getNativeBlob?I.data:new Blob([I.data],{type:M(R)});g.ondataavailable(F)}},C.onstart=function(){L.push("started")},C.onpause=function(){L.push("paused")},C.onresume=function(){L.push("resumed")},C.onstop=function(){L.push("stopped")},C.onerror=function(I){I&&(I.name||(I.name="UnknownError"),L.push("error: "+I),g.disableLogs||I.name.toString().toLowerCase().indexOf("invalidstate")!==-1||I.name.toString().toLowerCase().indexOf("notsupported")!==-1||I.name.toString().toLowerCase().indexOf("security")!==-1||I.name==="OutOfMemory"||I.name==="IllegalStreamModification"||I.name==="OtherRecordingError"||I.name,function(F){if(!T.manuallyStopped&&C&&C.state==="inactive")return delete g.timeslice,void C.start(6e5);setTimeout(void 0,1e3)}(),C.state!=="inactive"&&C.state!=="stopped"&&C.stop())},typeof g.timeSlice=="number"?(k(),C.start(g.timeSlice)):C.start(36e5),g.initCallback&&g.initCallback()},this.timestamps=[],this.stop=function(R){R=R||function(){},T.manuallyStopped=!0,C&&(this.recordingCallback=R,C.state==="recording"&&C.stop(),typeof g.timeSlice=="number"&&setTimeout(function(){T.blob=new Blob(W,{type:M(g)}),T.recordingCallback(T.blob)},100))},this.pause=function(){C&&C.state==="recording"&&C.pause()},this.resume=function(){C&&C.state==="paused"&&C.resume()},this.clearRecordedData=function(){C&&C.state==="recording"&&T.stop(S),S()},this.getInternalRecorder=function(){return C},this.blob=null,this.getState=function(){return C&&C.state||"inactive"};var L=[];this.getAllStates=function(){return L},g.checkForInactiveTracks===void 0&&(g.checkForInactiveTracks=!1),T=this,function R(){if(C&&g.checkForInactiveTracks!==!1)return function(){if("active"in E){if(!E.active)return!1}else if("ended"in E&&E.ended)return!1;return!0}()===!1?(g.disableLogs,void T.stop()):void setTimeout(R,1e3)}(),this.name="MediaStreamRecorder",this.toString=function(){return this.name}}function j(E,g){if(!P(E,"audio").length)throw"Your stream has no audio tracks.";var T,U=this,C=[],W=[],k=!1,M=0,S=2,L=(g=g||{}).desiredSampRate;function R(){if(g.checkForInactiveTracks===!1)return!0;if("active"in E){if(!E.active)return!1}else if("ended"in E&&E.ended)return!1;return!0}function I(Q,ue){function me(ge,We){var ve,Te=ge.numberOfAudioChannels,be=ge.leftBuffers.slice(0),Ye=ge.rightBuffers.slice(0),ot=ge.sampleRate,H=ge.internalInterleavedLength,ft=ge.desiredSampRate;function zt(Xe,Dt,Ct){var Pt=Math.round(Xe.length*(Dt/Ct)),lt=[],Wt=Number((Xe.length-1)/(Pt-1));lt[0]=Xe[0];for(var jt=1;jt<Pt-1;jt++){var Ki=jt*Wt,Ar=Number(Math.floor(Ki)).toFixed(),A=Number(Math.ceil(Ki)).toFixed(),Z=Ki-Ar;lt[jt]=Ke(Xe[Ar],Xe[A],Z)}return lt[Pt-1]=Xe[Xe.length-1],lt}function Ke(Xe,Dt,Ct){return Xe+(Dt-Xe)*Ct}function En(Xe,Dt){for(var Ct=new Float64Array(Dt),Pt=0,lt=Xe.length,Wt=0;Wt<lt;Wt++){var jt=Xe[Wt];Ct.set(jt,Pt),Pt+=jt.length}return Ct}function ri(Xe,Dt,Ct){for(var Pt=Ct.length,lt=0;lt<Pt;lt++)Xe.setUint8(Dt+lt,Ct.charCodeAt(lt))}Te===2&&(be=En(be,H),Ye=En(Ye,H),ft&&(be=zt(be,ft,ot),Ye=zt(Ye,ft,ot))),Te===1&&(be=En(be,H),ft&&(be=zt(be,ft,ot))),ft&&(ot=ft),Te===2&&(ve=function(Xe,Dt){for(var Ct=Xe.length+Dt.length,Pt=new Float64Array(Ct),lt=0,Wt=0;Wt<Ct;)Pt[Wt++]=Xe[lt],Pt[Wt++]=Dt[lt],lt++;return Pt}(be,Ye)),Te===1&&(ve=be);var ai=ve.length,qi=new ArrayBuffer(44+2*ai),mt=new DataView(qi);ri(mt,0,"RIFF"),mt.setUint32(4,36+2*ai,!0),ri(mt,8,"WAVE"),ri(mt,12,"fmt "),mt.setUint32(16,16,!0),mt.setUint16(20,1,!0),mt.setUint16(22,Te,!0),mt.setUint32(24,ot,!0),mt.setUint32(28,ot*Te*2,!0),mt.setUint16(32,2*Te,!0),mt.setUint16(34,16,!0),ri(mt,36,"data"),mt.setUint32(40,2*ai,!0);for(var Tr=ai,wr=44,Yi=0;Yi<Tr;Yi++)mt.setInt16(wr,32767*ve[Yi],!0),wr+=2;if(We)return We({buffer:qi,view:mt});postMessage({buffer:qi,view:mt})}if(Q.noWorker)me(Q,function(ge){ue(ge.buffer,ge.view)});else{var Ae,Re,fe,we=(Ae=me,Re=u.createObjectURL(new Blob([Ae.toString(),";this.onmessage =  function (eee) {"+Ae.name+"(eee.data);}"],{type:"application/javascript"})),(fe=new Worker(Re)).workerURL=Re,fe);we.onmessage=function(ge){ue(ge.data.buffer,ge.data.view),u.revokeObjectURL(we.workerURL),we.terminate()},we.postMessage(Q)}}g.leftChannel===!0&&(S=1),g.numberOfAudioChannels===1&&(S=1),(!S||S<1)&&(S=2),g.disableLogs,g.checkForInactiveTracks===void 0&&(g.checkForInactiveTracks=!0),this.record=function(){if(R()===!1)throw"Please make sure MediaStream is active.";B(),oe=V=!1,k=!0,g.timeSlice!==void 0&&q()},this.stop=function(Q){Q=Q||function(){},k=!1,I({desiredSampRate:L,sampleRate:w,numberOfAudioChannels:S,internalInterleavedLength:M,leftBuffers:C,rightBuffers:S===1?[]:W,noWorker:g.noWorker},function(ue,me){U.blob=new Blob([me],{type:"audio/wav"}),U.buffer=new ArrayBuffer(me.buffer.byteLength),U.view=me,U.sampleRate=L||w,U.bufferSize=N,U.length=M,oe=!1,Q&&Q(U.blob)})},e.Storage===void 0&&(e.Storage={AudioContextConstructor:null,AudioContext:window.AudioContext||window.webkitAudioContext}),e.Storage.AudioContextConstructor&&e.Storage.AudioContextConstructor.state!=="closed"||(e.Storage.AudioContextConstructor=new e.Storage.AudioContext);var F=e.Storage.AudioContextConstructor,y=F.createMediaStreamSource(E),N=g.bufferSize===void 0?4096:g.bufferSize;if([0,256,512,1024,2048,4096,8192,16384].indexOf(N)===-1&&g.disableLogs,F.createJavaScriptNode)T=F.createJavaScriptNode(N,S,S);else{if(!F.createScriptProcessor)throw"WebAudio API has no support on this browser.";T=F.createScriptProcessor(N,S,S)}y.connect(T),g.bufferSize||(N=T.bufferSize);var w=g.sampleRate!==void 0?g.sampleRate:F.sampleRate||44100;(w<22050||w>96e3)&&g.disableLogs,g.disableLogs||g.desiredSampRate;var V=!1;function B(){C=[],W=[],M=0,oe=!1,k=!1,V=!1,F=null,U.leftchannel=C,U.rightchannel=W,U.numberOfAudioChannels=S,U.desiredSampRate=L,U.sampleRate=w,U.recordingLength=M,O={left:[],right:[],recordingLength:0}}function ne(){T&&(T.onaudioprocess=null,T.disconnect(),T=null),y&&(y.disconnect(),y=null),B()}this.pause=function(){V=!0},this.resume=function(){if(R()===!1)throw"Please make sure MediaStream is active.";if(!k)return g.disableLogs,void this.record();V=!1},this.clearRecordedData=function(){g.checkForInactiveTracks=!1,k&&this.stop(ne),ne()},this.name="StereoAudioRecorder",this.toString=function(){return this.name};var oe=!1;T.onaudioprocess=function(Q){if(!V)if(R()===!1&&(g.disableLogs,T.disconnect(),k=!1),k){oe||(oe=!0,g.onAudioProcessStarted&&g.onAudioProcessStarted(),g.initCallback&&g.initCallback());var ue=Q.inputBuffer.getChannelData(0),me=new Float32Array(ue);if(C.push(me),S===2){var Ae=Q.inputBuffer.getChannelData(1),Re=new Float32Array(Ae);W.push(Re)}M+=N,U.recordingLength=M,g.timeSlice!==void 0&&(O.recordingLength+=N,O.left.push(me),S===2&&O.right.push(Re))}else y&&(y.disconnect(),y=null)},F.createMediaStreamDestination?T.connect(F.createMediaStreamDestination()):T.connect(F.destination),this.leftchannel=C,this.rightchannel=W,this.numberOfAudioChannels=S,this.desiredSampRate=L,this.sampleRate=w,U.recordingLength=M;var O={left:[],right:[],recordingLength:0};function q(){k&&typeof g.ondataavailable=="function"&&g.timeSlice!==void 0&&(O.left.length?(I({desiredSampRate:L,sampleRate:w,numberOfAudioChannels:S,internalInterleavedLength:O.recordingLength,leftBuffers:O.left,rightBuffers:S===1?[]:O.right},function(Q,ue){var me=new Blob([ue],{type:"audio/wav"});g.ondataavailable(me),setTimeout(q,g.timeSlice)}),O={left:[],right:[],recordingLength:0}):setTimeout(q,g.timeSlice))}}function K(E,g){if(typeof html2canvas>"u")throw"Please link: https://www.webrtc-experiment.com/screenshot.js";(g=g||{}).frameInterval||(g.frameInterval=10);var T=!1;["captureStream","mozCaptureStream","webkitCaptureStream"].forEach(function(w){w in document.createElement("canvas")&&(T=!0)});var U,C,W,k=!(!window.webkitRTCPeerConnection&&!window.webkitGetUserMedia||!window.chrome),M=50,S=navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);if(k&&S&&S[2]&&(M=parseInt(S[2],10)),k&&M<52&&(T=!1),g.useWhammyRecorder&&(T=!1),T)if(g.disableLogs,E instanceof HTMLCanvasElement)U=E;else{if(!(E instanceof CanvasRenderingContext2D))throw"Please pass either HTMLCanvasElement or CanvasRenderingContext2D.";U=E.canvas}else navigator.mozGetUserMedia&&g.disableLogs;this.record=function(){if(W=!0,T&&!g.useWhammyRecorder){var w;"captureStream"in U?w=U.captureStream(25):"mozCaptureStream"in U?w=U.mozCaptureStream(25):"webkitCaptureStream"in U&&(w=U.webkitCaptureStream(25));try{var V=new f;V.addTrack(P(w,"video")[0]),w=V}catch{}if(!w)throw"captureStream API are NOT available.";(C=new X(w,{mimeType:g.mimeType||"video/webm"})).record()}else N.frames=[],y=new Date().getTime(),F();g.initCallback&&g.initCallback()},this.getWebPImages=function(w){if(E.nodeName.toLowerCase()==="canvas"){var V=N.frames.length;N.frames.forEach(function(B,ne){var oe=V-ne;g.disableLogs,g.onEncodingCallback&&g.onEncodingCallback(oe,V);var O=B.image.toDataURL("image/webp",1);N.frames[ne].image=O}),g.disableLogs,w()}else w()},this.stop=function(w){W=!1;var V=this;T&&C?C.stop(w):this.getWebPImages(function(){N.compile(function(B){g.disableLogs,V.blob=B,V.blob.forEach&&(V.blob=new Blob([],{type:"video/webm"})),w&&w(V.blob),N.frames=[]})})};var L=!1;function R(){N.frames=[],W=!1,L=!1}function I(){var w=document.createElement("canvas"),V=w.getContext("2d");return w.width=E.width,w.height=E.height,V.drawImage(E,0,0),w}function F(){if(L)return y=new Date().getTime(),setTimeout(F,500);if(E.nodeName.toLowerCase()==="canvas"){var w=new Date().getTime()-y;return y=new Date().getTime(),N.frames.push({image:I(),duration:w}),void(W&&setTimeout(F,g.frameInterval))}html2canvas(E,{grabMouse:g.showMousePointer===void 0||g.showMousePointer,onrendered:function(V){var B=new Date().getTime()-y;if(!B)return setTimeout(F,g.frameInterval);y=new Date().getTime(),N.frames.push({image:V.toDataURL("image/webp",1),duration:B}),W&&setTimeout(F,g.frameInterval)}})}this.pause=function(){L=!0,C instanceof X&&C.pause()},this.resume=function(){L=!1,C instanceof X?C.resume():W||this.record()},this.clearRecordedData=function(){W&&this.stop(R),R()},this.name="CanvasRecorder",this.toString=function(){return this.name};var y=new Date().getTime(),N=new $.Video(100)}function ae(E,g){function T(F){F=F!==void 0?F:10;var y=new Date().getTime()-S;return y?W?(S=new Date().getTime(),setTimeout(T,100)):(S=new Date().getTime(),M.paused&&M.play(),I.drawImage(M,0,0,R.width,R.height),L.frames.push({duration:y,image:R.toDataURL("image/webp")}),void(C||setTimeout(T,F,F))):setTimeout(T,F,F)}function U(F,y,N,w,V){var B=document.createElement("canvas");B.width=R.width,B.height=R.height;var ne,oe,O,q=B.getContext("2d"),Q=[],ue=F.length,me=0,Ae=0,Re=0,fe=Math.sqrt(Math.pow(255,2)+Math.pow(255,2)+Math.pow(255,2)),we=!1;oe=-1,O=(ne={length:ue,functionToLoop:function(ge,We){var ve,Te,be,Ye=function(){!we&&be-ve<=0*be||(we=!0,Q.push(F[We])),ge()};if(we)Ye();else{var ot=new Image;ot.onload=function(){q.drawImage(ot,0,0,R.width,R.height);var H=q.getImageData(0,0,R.width,R.height);ve=0,Te=H.data.length,be=H.data.length/4;for(var ft=0;ft<Te;ft+=4){var zt={r:H.data[ft],g:H.data[ft+1],b:H.data[ft+2]};Math.sqrt(Math.pow(zt.r-me,2)+Math.pow(zt.g-Ae,2)+Math.pow(zt.b-Re,2))<=0*fe&&ve++}Ye()},ot.src=F[We].image}},callback:function(){(Q=Q.concat(F.slice(ue))).length<=0&&Q.push(F[F.length-1]),V(Q)}}).length,function ge(){++oe!==O?setTimeout(function(){ne.functionToLoop(ge,oe)},1):ne.callback()}()}(g=g||{}).frameInterval||(g.frameInterval=10),g.disableLogs,this.record=function(){g.width||(g.width=320),g.height||(g.height=240),g.video||(g.video={width:g.width,height:g.height}),g.canvas||(g.canvas={width:g.width,height:g.height}),R.width=g.canvas.width||320,R.height=g.canvas.height||240,I=R.getContext("2d"),g.video&&g.video instanceof HTMLVideoElement?(M=g.video.cloneNode(),g.initCallback&&g.initCallback()):(M=document.createElement("video"),Y(E,M),M.onloadedmetadata=function(){g.initCallback&&g.initCallback()},M.width=g.video.width,M.height=g.video.height),M.muted=!0,M.play(),S=new Date().getTime(),L=new $.Video,g.disableLogs,T(g.frameInterval)};var C=!1;this.stop=function(F){F=F||function(){},C=!0;var y=this;setTimeout(function(){U(L.frames,0,0,0,function(N){L.frames=N,g.advertisement&&g.advertisement.length&&(L.frames=g.advertisement.concat(L.frames)),L.compile(function(w){y.blob=w,y.blob.forEach&&(y.blob=new Blob([],{type:"video/webm"})),F&&F(y.blob)})})},10)};var W=!1;function k(){L.frames=[],C=!0,W=!1}this.pause=function(){W=!0},this.resume=function(){W=!1,C&&this.record()},this.clearRecordedData=function(){C||this.stop(k),k()},this.name="WhammyRecorder",this.toString=function(){return this.name};var M,S,L,R=document.createElement("canvas"),I=R.getContext("2d")}c!==void 0?D.AudioContext=c:typeof webkitAudioContext<"u"&&(D.AudioContext=webkitAudioContext),e!==void 0&&(e.Storage=D),e!==void 0&&(e.MediaStreamRecorder=X),e!==void 0&&(e.StereoAudioRecorder=j),e!==void 0&&(e.CanvasRecorder=K),e!==void 0&&(e.WhammyRecorder=ae);var $=function(){function E(T){this.frames=[],this.duration=T||1,this.quality=.8}function g(T){function U(R,I,F){return[{data:R,id:231}].concat(F.map(function(y){var N=function(w){var V=0;if(V|=128,w.trackNum>127)throw"TrackNumber > 127 not supported";return[128|w.trackNum,w.timecode>>8,255&w.timecode,V].map(function(B){return String.fromCharCode(B)}).join("")+w.frame}({discardable:0,frame:y.data.slice(4),invisible:0,keyframe:1,lacing:0,trackNum:1,timecode:Math.round(I)});return I+=y.duration,{data:N,id:163}}))}function C(R){for(var I=[];R>0;)I.push(255&R),R>>=8;return new Uint8Array(I.reverse())}function W(R){var I=[];R=(R.length%8?new Array(9-R.length%8).join("0"):"")+R;for(var F=0;F<R.length;F+=8)I.push(parseInt(R.substr(F,8),2));return new Uint8Array(I)}function k(R){for(var I=[],F=0;F<R.length;F++){var y=R[F].data;typeof y=="object"&&(y=k(y)),typeof y=="number"&&(y=W(y.toString(2))),typeof y=="string"&&(y=new Uint8Array(y.split("").map(function(oe){return oe.charCodeAt(0)})));var N=y.size||y.byteLength||y.length,w=Math.ceil(Math.ceil(Math.log(N)/Math.log(2))/8),V=N.toString(2),B=new Array(7*w+7+1-V.length).join("0")+V,ne=new Array(w).join("0")+"1"+B;I.push(C(R[F].id)),I.push(W(ne)),I.push(y)}return new Blob(I,{type:"video/webm"})}function M(R,I){return parseInt(R.substr(I+4,4).split("").map(function(F){var y=F.charCodeAt(0).toString(2);return new Array(8-y.length+1).join("0")+y}).join(""),2)}function S(R){for(var I=0,F={};I<R.length;){var y=R.substr(I,4),N=M(R,I),w=R.substr(I+4+4,N);I+=8+N,F[y]=F[y]||[],y==="RIFF"||y==="LIST"?F[y].push(S(w)):F[y].push(w)}return F}var L=new function(R){var I=function(oe){if(!oe[0])return void postMessage({error:"Something went wrong. Maybe WebP format is not supported in the current browser."});for(var O=oe[0].width,q=oe[0].height,Q=oe[0].duration,ue=1;ue<oe.length;ue++)Q+=oe[ue].duration;return{duration:Q,width:O,height:q}}(R);if(!I)return[];for(var F,y=[{id:440786851,data:[{data:1,id:17030},{data:1,id:17143},{data:4,id:17138},{data:8,id:17139},{data:"webm",id:17026},{data:2,id:17031},{data:2,id:17029}]},{id:408125543,data:[{id:357149030,data:[{data:1e6,id:2807729},{data:"whammy",id:19840},{data:"whammy",id:22337},{data:(F=I.duration,[].slice.call(new Uint8Array(new Float64Array([F]).buffer),0).map(function(oe){return String.fromCharCode(oe)}).reverse().join("")),id:17545}]},{id:374648427,data:[{id:174,data:[{data:1,id:215},{data:1,id:29637},{data:0,id:156},{data:"und",id:2274716},{data:"V_VP8",id:134},{data:"VP8",id:2459272},{data:1,id:131},{id:224,data:[{data:I.width,id:176},{data:I.height,id:186}]}]}]}]}],N=0,w=0;N<R.length;){var V=[],B=0;do V.push(R[N]),B+=R[N].duration,N++;while(N<R.length&&B<3e4);var ne={id:524531317,data:U(w,0,V)};y[1].data.push(ne),w+=B}return k(y)}(T.map(function(R){var I=function(F){for(var y=F.RIFF[0].WEBP[0],N=y.indexOf("\x9D*"),w=0,V=[];w<4;w++)V[w]=y.charCodeAt(N+3+w);return{width:16383&(V[1]<<8|V[0]),height:16383&(V[3]<<8|V[2]),data:y,riff:F}}(S(atob(R.image.slice(23))));return I.duration=R.duration,I}));postMessage(L)}return E.prototype.add=function(T,U){if("canvas"in T&&(T=T.canvas),"toDataURL"in T&&(T=T.toDataURL("image/webp",this.quality)),!/^data:image\/webp;base64,/gi.test(T))throw"Input must be formatted properly as a base64 encoded DataURI of type image/webp";this.frames.push({image:T,duration:U||this.duration})},E.prototype.compile=function(T){var U,C,W,k=(U=g,C=u.createObjectURL(new Blob([U.toString(),"this.onmessage =  function (eee) {"+U.name+"(eee.data);}"],{type:"application/javascript"})),W=new Worker(C),u.revokeObjectURL(C),W);k.onmessage=function(M){M.data.error||T(M.data)},k.postMessage(this.frames)},{Video:E}}();e!==void 0&&(e.Whammy=$);var se={init:function(){var E=this;if(typeof indexedDB<"u"&&indexedDB.open!==void 0){var g,T=this.dbName||location.href.replace(/\/|:|#|%|\.|\[|\]/g,""),U=indexedDB.open(T,1);U.onerror=E.onError,U.onsuccess=function(){(g=U.result).onerror=E.onError,g.setVersion&&g.version!==1?g.setVersion(1).onsuccess=function(){C(g),W()}:W()},U.onupgradeneeded=function(k){C(k.target.result)}}function C(k){k.createObjectStore(E.dataStoreName)}function W(){var k=g.transaction([E.dataStoreName],"readwrite");function M(S){k.objectStore(E.dataStoreName).get(S).onsuccess=function(L){E.callback&&E.callback(L.target.result,S)}}E.videoBlob&&k.objectStore(E.dataStoreName).put(E.videoBlob,"videoBlob"),E.gifBlob&&k.objectStore(E.dataStoreName).put(E.gifBlob,"gifBlob"),E.audioBlob&&k.objectStore(E.dataStoreName).put(E.audioBlob,"audioBlob"),M("audioBlob"),M("videoBlob"),M("gifBlob")}},Fetch:function(E){return this.callback=E,this.init(),this},Store:function(E){return this.audioBlob=E.audioBlob,this.videoBlob=E.videoBlob,this.gifBlob=E.gifBlob,this.init(),this},onError:function(E){},dataStoreName:"recordRTC",dbName:null};function J(E,g){if(typeof GIFEncoder>"u"){var T=document.createElement("script");T.src="https://www.webrtc-experiment.com/gif-recorder.js",(document.body||document.documentElement).appendChild(T)}g=g||{};var U=E instanceof CanvasRenderingContext2D||E instanceof HTMLCanvasElement;this.record=function(){typeof GIFEncoder<"u"&&M?(U||(g.width||(g.width=S.offsetWidth||320),g.height||(g.height=S.offsetHeight||240),g.video||(g.video={width:g.width,height:g.height}),g.canvas||(g.canvas={width:g.width,height:g.height}),W.width=g.canvas.width||320,W.height=g.canvas.height||240,S.width=g.video.width||320,S.height=g.video.height||240),(R=new GIFEncoder).setRepeat(0),R.setDelay(g.frameRate||200),R.setQuality(g.quality||10),R.start(),typeof g.onGifRecordingStarted=="function"&&g.onGifRecordingStarted(),I=s(function y(N){if(F.clearedRecordedData!==!0){if(C)return setTimeout(function(){y(N)},100);I=s(y),typeof L===void 0&&(L=N),N-L<90||(!U&&S.paused&&S.play(),U||k.drawImage(S,0,0,W.width,W.height),g.onGifPreview&&g.onGifPreview(W.toDataURL("image/png")),R.addFrame(k),L=N)}}),g.initCallback&&g.initCallback()):setTimeout(F.record,1e3)},this.stop=function(y){y=y||function(){},I&&l(I),this.blob=new Blob([new Uint8Array(R.stream().bin)],{type:"image/gif"}),y(this.blob),R.stream().bin=[]};var C=!1;this.pause=function(){C=!0},this.resume=function(){C=!1},this.clearRecordedData=function(){F.clearedRecordedData=!0,R&&(R.stream().bin=[])},this.name="GifRecorder",this.toString=function(){return this.name};var W=document.createElement("canvas"),k=W.getContext("2d");U&&(E instanceof CanvasRenderingContext2D?W=(k=E).canvas:E instanceof HTMLCanvasElement&&(k=E.getContext("2d"),W=E));var M=!0;if(!U){var S=document.createElement("video");S.muted=!0,S.autoplay=!0,S.playsInline=!0,M=!1,S.onloadedmetadata=function(){M=!0},Y(E,S),S.play()}var L,R,I=null,F=this}function ce(E,g){(function(w){e===void 0&&w&&typeof window>"u"&&Je!==void 0&&(Je.navigator={userAgent:"Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45",getUserMedia:function(){}},Je.console||(Je.console={}),Je.console.log!==void 0&&Je.console.error!==void 0||(Je.console.error=Je.console.log=Je.console.log||function(){}),typeof document>"u"&&(w.document={documentElement:{appendChild:function(){return""}}},document.createElement=document.captureStream=document.mozCaptureStream=function(){var V={getContext:function(){return V},play:function(){},pause:function(){},drawImage:function(){},toDataURL:function(){return""},style:{}};return V},w.HTMLVideoElement=function(){}),typeof location>"u"&&(w.location={protocol:"file:",href:"",hash:""}),typeof screen>"u"&&(w.screen={width:0,height:0}),S===void 0&&(w.URL={createObjectURL:function(){return""},revokeObjectURL:function(){return""}}),w.window=Je)})(Je!==void 0?Je:null),g=g||"multi-streams-mixer";var T=[],U=!1,C=document.createElement("canvas"),W=C.getContext("2d");C.style.opacity=0,C.style.position="absolute",C.style.zIndex=-1,C.style.top="-1000em",C.style.left="-1000em",C.className=g,(document.body||document.documentElement).appendChild(C),this.disableLogs=!1,this.frameInterval=10,this.width=360,this.height=240,this.useGainNode=!0;var k=this,M=window.AudioContext;M===void 0&&(typeof webkitAudioContext<"u"&&(M=webkitAudioContext),typeof mozAudioContext<"u"&&(M=mozAudioContext));var S=window.URL;S===void 0&&typeof webkitURL<"u"&&(S=webkitURL),typeof navigator<"u"&&navigator.getUserMedia===void 0&&(navigator.webkitGetUserMedia!==void 0&&(navigator.getUserMedia=navigator.webkitGetUserMedia),navigator.mozGetUserMedia!==void 0&&(navigator.getUserMedia=navigator.mozGetUserMedia));var L=window.MediaStream;L===void 0&&typeof webkitMediaStream<"u"&&(L=webkitMediaStream),L!==void 0&&L.prototype.stop===void 0&&(L.prototype.stop=function(){this.getTracks().forEach(function(w){w.stop()})});var R={};function I(){if(!U){var w=T.length,V=!1,B=[];if(T.forEach(function(oe){oe.stream||(oe.stream={}),oe.stream.fullcanvas?V=oe:B.push(oe)}),V)C.width=V.stream.width,C.height=V.stream.height;else if(B.length){C.width=w>1?2*B[0].width:B[0].width;var ne=1;w!==3&&w!==4||(ne=2),w!==5&&w!==6||(ne=3),w!==7&&w!==8||(ne=4),w!==9&&w!==10||(ne=5),C.height=B[0].height*ne}else C.width=k.width||360,C.height=k.height||240;V&&V instanceof HTMLVideoElement&&F(V),B.forEach(function(oe,O){F(oe,O)}),setTimeout(I,k.frameInterval)}}function F(w,V){if(!U){var B=0,ne=0,oe=w.width,O=w.height;V===1&&(B=w.width),V===2&&(ne=w.height),V===3&&(B=w.width,ne=w.height),V===4&&(ne=2*w.height),V===5&&(B=w.width,ne=2*w.height),V===6&&(ne=3*w.height),V===7&&(B=w.width,ne=3*w.height),w.stream.left!==void 0&&(B=w.stream.left),w.stream.top!==void 0&&(ne=w.stream.top),w.stream.width!==void 0&&(oe=w.stream.width),w.stream.height!==void 0&&(O=w.stream.height),W.drawImage(w,B,ne,oe,O),typeof w.stream.onRender=="function"&&w.stream.onRender(W,B,ne,oe,O,V)}}function y(w){var V=document.createElement("video");return function(B,ne){"srcObject"in ne?ne.srcObject=B:"mozSrcObject"in ne?ne.mozSrcObject=B:ne.srcObject=B}(w,V),V.className=g,V.muted=!0,V.volume=0,V.width=w.width||k.width||360,V.height=w.height||k.height||240,V.play(),V}function N(w){T=[],(w=w||E).forEach(function(V){if(V.getTracks().filter(function(ne){return ne.kind==="video"}).length){var B=y(V);B.stream=V,T.push(B)}})}M!==void 0?R.AudioContext=M:typeof webkitAudioContext<"u"&&(R.AudioContext=webkitAudioContext),this.startDrawingFrames=function(){I()},this.appendStreams=function(w){if(!w)throw"First parameter is required.";w instanceof Array||(w=[w]),w.forEach(function(V){var B=new L;if(V.getTracks().filter(function(O){return O.kind==="video"}).length){var ne=y(V);ne.stream=V,T.push(ne),B.addTrack(V.getTracks().filter(function(O){return O.kind==="video"})[0])}if(V.getTracks().filter(function(O){return O.kind==="audio"}).length){var oe=k.audioContext.createMediaStreamSource(V);k.audioDestination=k.audioContext.createMediaStreamDestination(),oe.connect(k.audioDestination),B.addTrack(k.audioDestination.stream.getTracks().filter(function(O){return O.kind==="audio"})[0])}E.push(B)})},this.releaseStreams=function(){T=[],U=!0,k.gainNode&&(k.gainNode.disconnect(),k.gainNode=null),k.audioSources.length&&(k.audioSources.forEach(function(w){w.disconnect()}),k.audioSources=[]),k.audioDestination&&(k.audioDestination.disconnect(),k.audioDestination=null),k.audioContext&&k.audioContext.close(),k.audioContext=null,W.clearRect(0,0,C.width,C.height),C.stream&&(C.stream.stop(),C.stream=null)},this.resetVideoStreams=function(w){!w||w instanceof Array||(w=[w]),N(w)},this.name="MultiStreamsMixer",this.toString=function(){return this.name},this.getMixedStream=function(){U=!1;var w=function(){var B;N(),"captureStream"in C?B=C.captureStream():"mozCaptureStream"in C?B=C.mozCaptureStream():k.disableLogs;var ne=new L;return B.getTracks().filter(function(oe){return oe.kind==="video"}).forEach(function(oe){ne.addTrack(oe)}),C.stream=ne,ne}(),V=function(){R.AudioContextConstructor||(R.AudioContextConstructor=new R.AudioContext),k.audioContext=R.AudioContextConstructor,k.audioSources=[],k.useGainNode===!0&&(k.gainNode=k.audioContext.createGain(),k.gainNode.connect(k.audioContext.destination),k.gainNode.gain.value=0);var B=0;if(E.forEach(function(ne){if(ne.getTracks().filter(function(O){return O.kind==="audio"}).length){B++;var oe=k.audioContext.createMediaStreamSource(ne);k.useGainNode===!0&&oe.connect(k.gainNode),k.audioSources.push(oe)}}),!!B)return k.audioDestination=k.audioContext.createMediaStreamDestination(),k.audioSources.forEach(function(ne){ne.connect(k.audioDestination)}),k.audioDestination.stream}();return V&&V.getTracks().filter(function(B){return B.kind==="audio"}).forEach(function(B){w.addTrack(B)}),E.forEach(function(B){B.fullcanvas}),w}}function re(E,g){E=E||[];var T,U,C=this;(g=g||{elementClass:"multi-streams-mixer",mimeType:"video/webm",video:{width:360,height:240}}).frameInterval||(g.frameInterval=10),g.video||(g.video={}),g.video.width||(g.video.width=360),g.video.height||(g.video.height=240),this.record=function(){var W;T=new ce(E,g.elementClass||"multi-streams-mixer"),(W=[],E.forEach(function(k){P(k,"video").forEach(function(M){W.push(M)})}),W).length&&(T.frameInterval=g.frameInterval||10,T.width=g.video.width||360,T.height=g.video.height||240,T.startDrawingFrames()),g.previewStream&&typeof g.previewStream=="function"&&g.previewStream(T.getMixedStream()),(U=new X(T.getMixedStream(),g)).record()},this.stop=function(W){U&&U.stop(function(k){C.blob=k,W(k),C.clearRecordedData()})},this.pause=function(){U&&U.pause()},this.resume=function(){U&&U.resume()},this.clearRecordedData=function(){U&&(U.clearRecordedData(),U=null),T&&(T.releaseStreams(),T=null)},this.addStreams=function(W){if(!W)throw"First parameter is required.";W instanceof Array||(W=[W]),E.concat(W),U&&T&&(T.appendStreams(W),g.previewStream&&typeof g.previewStream=="function"&&g.previewStream(T.getMixedStream()))},this.resetVideoStreams=function(W){T&&(!W||W instanceof Array||(W=[W]),T.resetVideoStreams(W))},this.getMixer=function(){return T},this.name="MultiStreamRecorder",this.toString=function(){return this.name}}function de(E,g){var T,U,C;function W(){return new ReadableStream({start:function(S){var L=document.createElement("canvas"),R=document.createElement("video"),I=!0;R.srcObject=E,R.muted=!0,R.height=g.height,R.width=g.width,R.volume=0,R.onplaying=function(){L.width=g.width,L.height=g.height;var F=L.getContext("2d"),y=1e3/g.frameRate,N=setInterval(function(){if(T&&(clearInterval(N),S.close()),I&&(I=!1,g.onVideoProcessStarted&&g.onVideoProcessStarted()),F.drawImage(R,0,0),S._controlledReadableStream.state!=="closed")try{S.enqueue(F.getImageData(0,0,g.width,g.height))}catch{}},y)},R.play()}})}function k(S,L){if(!g.workerPath&&!L)return T=!1,void fetch("https://unpkg.com/webm-wasm@latest/dist/webm-worker.js").then(function(I){I.arrayBuffer().then(function(F){k(S,F)})});if(!g.workerPath&&L instanceof ArrayBuffer){var R=new Blob([L],{type:"text/javascript"});g.workerPath=u.createObjectURL(R)}g.workerPath,(U=new Worker(g.workerPath)).postMessage(g.webAssemblyPath||"https://unpkg.com/webm-wasm@latest/dist/webm-wasm.wasm"),U.addEventListener("message",function(I){I.data==="READY"?(U.postMessage({width:g.width,height:g.height,bitrate:g.bitrate||1200,timebaseDen:g.frameRate||30,realtime:g.realtime}),W().pipeTo(new WritableStream({write:function(F){T||U.postMessage(F.data.buffer,[F.data.buffer])}}))):I.data&&(C||M.push(I.data))})}(g=g||{}).width=g.width||640,g.height=g.height||480,g.frameRate=g.frameRate||30,g.bitrate=g.bitrate||1200,g.realtime=g.realtime||!0,this.record=function(){M=[],C=!1,this.blob=null,k(E),typeof g.initCallback=="function"&&g.initCallback()},this.pause=function(){C=!0},this.resume=function(){C=!1};var M=[];this.stop=function(S){T=!0;var L=this;(function(R){U?(U.addEventListener("message",function(I){I.data===null&&(U.terminate(),U=null,R&&R())}),U.postMessage(null)):R&&R()})(function(){L.blob=new Blob(M,{type:"video/webm"}),S(L.blob)})},this.name="WebAssemblyRecorder",this.toString=function(){return this.name},this.clearRecordedData=function(){M=[],C=!1,this.blob=null},this.blob=null}e!==void 0&&(e.DiskStorage=se),e!==void 0&&(e.GifRecorder=J),e===void 0&&(r.exports=ce),e!==void 0&&(e.MultiStreamRecorder=re),e!==void 0&&(e.RecordRTCPromisesHandler=function(E,g){if(!this)throw'Use "new RecordRTCPromisesHandler()"';if(E===void 0)throw'First argument "MediaStream" is required.';var T=this;T.recordRTC=new e(E,g),this.startRecording=function(){return new Promise(function(U,C){try{T.recordRTC.startRecording(),U()}catch(W){C(W)}})},this.stopRecording=function(){return new Promise(function(U,C){try{T.recordRTC.stopRecording(function(W){T.blob=T.recordRTC.getBlob(),T.blob&&T.blob.size?U(W):C("Empty blob.",T.blob)})}catch(W){C(W)}})},this.pauseRecording=function(){return new Promise(function(U,C){try{T.recordRTC.pauseRecording(),U()}catch(W){C(W)}})},this.resumeRecording=function(){return new Promise(function(U,C){try{T.recordRTC.resumeRecording(),U()}catch(W){C(W)}})},this.getDataURL=function(U){return new Promise(function(C,W){try{T.recordRTC.getDataURL(function(k){C(k)})}catch(k){W(k)}})},this.getBlob=function(){return new Promise(function(U,C){try{U(T.recordRTC.getBlob())}catch(W){C(W)}})},this.getInternalRecorder=function(){return new Promise(function(U,C){try{U(T.recordRTC.getInternalRecorder())}catch(W){C(W)}})},this.reset=function(){return new Promise(function(U,C){try{U(T.recordRTC.reset())}catch(W){C(W)}})},this.destroy=function(){return new Promise(function(U,C){try{U(T.recordRTC.destroy())}catch(W){C(W)}})},this.getState=function(){return new Promise(function(U,C){try{U(T.recordRTC.getState())}catch(W){C(W)}})},this.blob=null,this.version="5.6.2"}),e!==void 0&&(e.WebAssemblyRecorder=de)})(ec);const Gp=Hp(ec.exports),ji=document.getElementById("toggleRecording");let yr;document.getElementById("recordedVideo");let ks=!1;function Wp(r,e,t){ks?tc():async function(n,i,a){const s=n.captureStream(60),o=i.createMediaStreamDestination();a.connect(o);const l=o.stream,c=new MediaStream([...s.getTracks(),...l.getTracks()]);yr=new Gp(c,{type:"video",mimeType:"video/webm; codecs=vp9",bitsPerSecond:51e5,timeSlice:1e3}),yr.setRecordingDuration(3e4).onRecordingStopped(tc),yr.startRecording(),ji.classList.add("recording"),ji.textContent="Stop Recording",ks=!0}(r,e,t)}async function tc(){yr.stopRecording(()=>{(function(r,e="recording.webm"){const t=URL.createObjectURL(r),n=document.createElement("a");n.style.display="none",n.href=t,n.download=e,document.body.appendChild(n),n.click(),document.body.removeChild(n),window.URL.revokeObjectURL(t)})(yr.getBlob())}),ji.classList.remove("recording"),ji.textContent="Start Recording",ks=!1}const jp=new Os({width:300,container:document.getElementById("gui-container")});document.documentElement.style.setProperty("--gui-width","300px");const Vs={},Gt=document.querySelector("canvas.webgl"),Xp=Gt.getContext("webgl2"),Ma=new cl,nc=new class extends Bn{constructor(r){super(r),this.decoderPath="",this.decoderConfig={},this.decoderBinary=null,this.decoderPending=null,this.workerLimit=4,this.workerPool=[],this.workerNextTaskID=1,this.workerSourceURL="",this.defaultAttributeIDs={position:"POSITION",normal:"NORMAL",color:"COLOR",uv:"TEX_COORD"},this.defaultAttributeTypes={position:"Float32Array",normal:"Float32Array",color:"Float32Array",uv:"Float32Array"}}setDecoderPath(r){return this.decoderPath=r,this}setDecoderConfig(r){return this.decoderConfig=r,this}setWorkerLimit(r){return this.workerLimit=r,this}load(r,e,t,n){const i=new gr(this.manager);i.setPath(this.path),i.setResponseType("arraybuffer"),i.setRequestHeader(this.requestHeader),i.setWithCredentials(this.withCredentials),i.load(r,a=>{this.parse(a,e,n)},t,n)}parse(r,e,t=()=>{}){this.decodeDracoFile(r,e,null,null,_t,t).catch(t)}decodeDracoFile(r,e,t,n,i=yt,a=()=>{}){const s={attributeIDs:t||this.defaultAttributeIDs,attributeTypes:n||this.defaultAttributeTypes,useUniqueIDs:!!t,vertexColorSpace:i};return this.decodeGeometry(r,s).then(e).catch(a)}decodeGeometry(r,e){const t=JSON.stringify(e);if(Us.has(r)){const o=Us.get(r);if(o.key===t)return o.promise;if(r.byteLength===0)throw new Error("THREE.DRACOLoader: Unable to re-decode a buffer with different settings. Buffer has already been transferred.")}let n;const i=this.workerNextTaskID++,a=r.byteLength,s=this._getWorker(i,a).then(o=>(n=o,new Promise((l,c)=>{n._callbacks[i]={resolve:l,reject:c},n.postMessage({type:"decode",id:i,taskConfig:e,buffer:r},[r])}))).then(o=>this._createGeometry(o.geometry));return s.catch(()=>!0).then(()=>{n&&i&&this._releaseTask(n,i)}),Us.set(r,{key:t,promise:s}),s}_createGeometry(r){const e=new Bt;r.index&&e.setIndex(new rt(r.index.array,1));for(let t=0;t<r.attributes.length;t++){const n=r.attributes[t],i=n.name,a=n.array,s=n.itemSize,o=new rt(a,s);i==="color"&&(this._assignVertexColorSpace(o,n.vertexColorSpace),o.normalized=!(a instanceof Float32Array)),e.setAttribute(i,o)}return e}_assignVertexColorSpace(r,e){if(e!==_t)return;const t=new Se;for(let n=0,i=r.count;n<i;n++)t.fromBufferAttribute(r,n).convertSRGBToLinear(),r.setXYZ(n,t.r,t.g,t.b)}_loadLibrary(r,e){const t=new gr(this.manager);return t.setPath(this.decoderPath),t.setResponseType(e),t.setWithCredentials(this.withCredentials),new Promise((n,i)=>{t.load(r,n,void 0,i)})}preload(){return this._initDecoder(),this}_initDecoder(){if(this.decoderPending)return this.decoderPending;const r=typeof WebAssembly!="object"||this.decoderConfig.type==="js",e=[];return r?e.push(this._loadLibrary("draco_decoder.js","text")):(e.push(this._loadLibrary("draco_wasm_wrapper.js","text")),e.push(this._loadLibrary("draco_decoder.wasm","arraybuffer"))),this.decoderPending=Promise.all(e).then(t=>{const n=t[0];r||(this.decoderConfig.wasmBinary=t[1]);const i=_p.toString(),a=["/* draco decoder */",n,"","/* worker */",i.substring(i.indexOf("{")+1,i.lastIndexOf("}"))].join(`
`);this.workerSourceURL=URL.createObjectURL(new Blob([a]))}),this.decoderPending}_getWorker(r,e){return this._initDecoder().then(()=>{if(this.workerPool.length<this.workerLimit){const n=new Worker(this.workerSourceURL);n._callbacks={},n._taskCosts={},n._taskLoad=0,n.postMessage({type:"init",decoderConfig:this.decoderConfig}),n.onmessage=function(i){const a=i.data;switch(a.type){case"decode":n._callbacks[a.id].resolve(a);break;case"error":n._callbacks[a.id].reject(a)}},this.workerPool.push(n)}else this.workerPool.sort(function(n,i){return n._taskLoad>i._taskLoad?-1:1});const t=this.workerPool[this.workerPool.length-1];return t._taskCosts[r]=e,t._taskLoad+=e,t})}_releaseTask(r,e){r._taskLoad-=r._taskCosts[e],delete r._callbacks[e],delete r._taskCosts[e]}debug(){}dispose(){for(let r=0;r<this.workerPool.length;++r)this.workerPool[r].terminate();return this.workerPool.length=0,this.workerSourceURL!==""&&URL.revokeObjectURL(this.workerSourceURL),this}};nc.setDecoderPath("/draco/");const ic=new class extends Bn{constructor(r){super(r),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new Hd(e)}),this.register(function(e){return new Gd(e)}),this.register(function(e){return new Qd(e)}),this.register(function(e){return new $d(e)}),this.register(function(e){return new ep(e)}),this.register(function(e){return new jd(e)}),this.register(function(e){return new Xd(e)}),this.register(function(e){return new qd(e)}),this.register(function(e){return new Yd(e)}),this.register(function(e){return new Vd(e)}),this.register(function(e){return new Kd(e)}),this.register(function(e){return new Wd(e)}),this.register(function(e){return new Jd(e)}),this.register(function(e){return new Zd(e)}),this.register(function(e){return new zd(e)}),this.register(function(e){return new tp(e)}),this.register(function(e){return new np(e)})}load(r,e,t,n){const i=this;let a;if(this.resourcePath!=="")a=this.resourcePath;else if(this.path!==""){const l=xr.extractUrlBase(r);a=xr.resolveURL(l,this.path)}else a=xr.extractUrlBase(r);this.manager.itemStart(r);const s=function(l){n&&n(l),i.manager.itemError(r),i.manager.itemEnd(r)},o=new gr(this.manager);o.setPath(this.path),o.setResponseType("arraybuffer"),o.setRequestHeader(this.requestHeader),o.setWithCredentials(this.withCredentials),o.load(r,function(l){try{i.parse(l,a,function(c){e(c),i.manager.itemEnd(r)},s)}catch(c){s(c)}},t,s)}setDRACOLoader(r){return this.dracoLoader=r,this}setDDSLoader(){throw new Error('THREE.GLTFLoader: "MSFT_texture_dds" no longer supported. Please update to "KHR_texture_basisu".')}setKTX2Loader(r){return this.ktx2Loader=r,this}setMeshoptDecoder(r){return this.meshoptDecoder=r,this}register(r){return this.pluginCallbacks.indexOf(r)===-1&&this.pluginCallbacks.push(r),this}unregister(r){return this.pluginCallbacks.indexOf(r)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(r),1),this}parse(r,e,t,n){let i;const a={},s={},o=new TextDecoder;if(typeof r=="string")i=JSON.parse(r);else if(r instanceof ArrayBuffer)if(o.decode(new Uint8Array(r,0,4))===jl){try{a[Oe.KHR_BINARY_GLTF]=new ap(r)}catch(c){return void(n&&n(c))}i=JSON.parse(a[Oe.KHR_BINARY_GLTF].content)}else i=JSON.parse(o.decode(r));else i=r;if(i.asset===void 0||i.asset.version[0]<2)return void(n&&n(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.")));const l=new xp(i,{path:e||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let c=0;c<this.pluginCallbacks.length;c++){const u=this.pluginCallbacks[c](l);u.name,s[u.name]=u,a[u.name]=!0}if(i.extensionsUsed)for(let c=0;c<i.extensionsUsed.length;++c){const u=i.extensionsUsed[c],h=i.extensionsRequired||[];switch(u){case Oe.KHR_MATERIALS_UNLIT:a[u]=new kd;break;case Oe.KHR_DRACO_MESH_COMPRESSION:a[u]=new sp(i,this.dracoLoader);break;case Oe.KHR_TEXTURE_TRANSFORM:a[u]=new op;break;case Oe.KHR_MESH_QUANTIZATION:a[u]=new lp;break;default:h.indexOf(u)>=0&&s[u]}}l.setExtensions(a),l.setPlugins(s),l.parse(t,n)}parseAsync(r,e){const t=this;return new Promise(function(n,i){t.parse(r,e,n,i)})}};ic.setDRACOLoader(nc);const et={width:window.innerWidth,height:window.innerHeight,pixelRatio:Math.min(window.devicePixelRatio,2)},kn=new At(35,et.width/et.height,.1,100);kn.position.set(0,3,20),Ma.add(kn);const rc=new class extends jn{constructor(r,e){super(),this.object=r,this.domElement=e,this.domElement.style.touchAction="none",this.enabled=!0,this.target=new z,this.cursor=new z,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Hn,MIDDLE:Ys,RIGHT:Ks},this.touches={ONE:Zs,TWO:Js},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this.getPolarAngle=function(){return s.phi},this.getAzimuthalAngle=function(){return s.theta},this.getDistance=function(){return this.object.position.distanceTo(this.target)},this.listenToKeyEvents=function(O){O.addEventListener("keydown",w),this._domElementKeyEvents=O},this.stopListenToKeyEvents=function(){this._domElementKeyEvents.removeEventListener("keydown",w),this._domElementKeyEvents=null},this.saveState=function(){t.target0.copy(t.target),t.position0.copy(t.object.position),t.zoom0=t.object.zoom},this.reset=function(){t.target.copy(t.target0),t.object.position.copy(t.position0),t.object.zoom=t.zoom0,t.object.updateProjectionMatrix(),t.dispatchEvent(Vl),t.update(),i=n.NONE},this.update=function(){const O=new z,q=new Zt().setFromUnitVectors(r.up,new z(0,1,0)),Q=q.clone().invert(),ue=new z,me=new Zt,Ae=new z,Re=2*Math.PI;return function(fe=null){const we=t.object.position;O.copy(we).sub(t.target),O.applyQuaternion(q),s.setFromVector3(O),t.autoRotate&&i===n.NONE&&K(function(Te){return Te!==null?2*Math.PI/60*t.autoRotateSpeed*Te:2*Math.PI/60/60*t.autoRotateSpeed}(fe)),t.enableDamping?(s.theta+=o.theta*t.dampingFactor,s.phi+=o.phi*t.dampingFactor):(s.theta+=o.theta,s.phi+=o.phi);let ge=t.minAzimuthAngle,We=t.maxAzimuthAngle;isFinite(ge)&&isFinite(We)&&(ge<-Math.PI?ge+=Re:ge>Math.PI&&(ge-=Re),We<-Math.PI?We+=Re:We>Math.PI&&(We-=Re),s.theta=ge<=We?Math.max(ge,Math.min(We,s.theta)):s.theta>(ge+We)/2?Math.max(ge,s.theta):Math.min(We,s.theta)),s.phi=Math.max(t.minPolarAngle,Math.min(t.maxPolarAngle,s.phi)),s.makeSafe(),t.enableDamping===!0?t.target.addScaledVector(c,t.dampingFactor):t.target.add(c),t.target.sub(t.cursor),t.target.clampLength(t.minTargetRadius,t.maxTargetRadius),t.target.add(t.cursor);let ve=!1;if(t.zoomToCursor&&Y||t.object.isOrthographicCamera)s.radius=E(s.radius);else{const Te=s.radius;s.radius=E(s.radius*l),ve=Te!=s.radius}if(O.setFromSpherical(s),O.applyQuaternion(Q),we.copy(t.target).add(O),t.object.lookAt(t.target),t.enableDamping===!0?(o.theta*=1-t.dampingFactor,o.phi*=1-t.dampingFactor,c.multiplyScalar(1-t.dampingFactor)):(o.set(0,0,0),c.set(0,0,0)),t.zoomToCursor&&Y){let Te=null;if(t.object.isPerspectiveCamera){const be=O.length();Te=E(be*l);const Ye=be-Te;t.object.position.addScaledVector(b,Ye),t.object.updateMatrixWorld(),ve=!!Ye}else if(t.object.isOrthographicCamera){const be=new z(P.x,P.y,0);be.unproject(t.object);const Ye=t.object.zoom;t.object.zoom=Math.max(t.minZoom,Math.min(t.maxZoom,t.object.zoom/l)),t.object.updateProjectionMatrix(),ve=Ye!==t.object.zoom;const ot=new z(P.x,P.y,0);ot.unproject(t.object),t.object.position.sub(ot).add(be),t.object.updateMatrixWorld(),Te=O.length()}else t.zoomToCursor=!1;Te!==null&&(this.screenSpacePanning?t.target.set(0,0,-1).transformDirection(t.object.matrix).multiplyScalar(Te).add(t.object.position):(ya.origin.copy(t.object.position),ya.direction.set(0,0,-1).transformDirection(t.object.matrix),Math.abs(t.object.up.dot(ya.direction))<Fd?r.lookAt(t.target):(Gl.setFromNormalAndCoplanarPoint(t.object.up,t.target),ya.intersectPlane(Gl,t.target))))}else if(t.object.isOrthographicCamera){const Te=t.object.zoom;t.object.zoom=Math.max(t.minZoom,Math.min(t.maxZoom,t.object.zoom/l)),Te!==t.object.zoom&&(t.object.updateProjectionMatrix(),ve=!0)}return l=1,Y=!1,!!(ve||ue.distanceToSquared(t.object.position)>a||8*(1-me.dot(t.object.quaternion))>a||Ae.distanceToSquared(t.target)>a)&&(t.dispatchEvent(Vl),ue.copy(t.object.position),me.copy(t.object.quaternion),Ae.copy(t.target),!0)}}(),this.dispose=function(){t.domElement.removeEventListener("contextmenu",B),t.domElement.removeEventListener("pointerdown",L),t.domElement.removeEventListener("pointercancel",I),t.domElement.removeEventListener("wheel",F),t.domElement.removeEventListener("pointermove",R),t.domElement.removeEventListener("pointerup",I),t.domElement.getRootNode().removeEventListener("keydown",y,{capture:!0}),t._domElementKeyEvents!==null&&(t._domElementKeyEvents.removeEventListener("keydown",w),t._domElementKeyEvents=null)};const t=this,n={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6};let i=n.NONE;const a=1e-6,s=new kl,o=new kl;let l=1;const c=new z,u=new _e,h=new _e,d=new _e,p=new _e,v=new _e,x=new _e,f=new _e,_=new _e,m=new _e,b=new z,P=new _e;let Y=!1;const D=[],G={};let X=!1;function j(O){const q=Math.abs(.01*O);return Math.pow(.95,t.zoomSpeed*q)}function K(O){o.theta-=O}function ae(O){o.phi-=O}const $=function(){const O=new z;return function(q,Q){O.setFromMatrixColumn(Q,0),O.multiplyScalar(-q),c.add(O)}}(),se=function(){const O=new z;return function(q,Q){t.screenSpacePanning===!0?O.setFromMatrixColumn(Q,1):(O.setFromMatrixColumn(Q,0),O.crossVectors(t.object.up,O)),O.multiplyScalar(q),c.add(O)}}(),J=function(){const O=new z;return function(q,Q){const ue=t.domElement;if(t.object.isPerspectiveCamera){const me=t.object.position;O.copy(me).sub(t.target);let Ae=O.length();Ae*=Math.tan(t.object.fov/2*Math.PI/180),$(2*q*Ae/ue.clientHeight,t.object.matrix),se(2*Q*Ae/ue.clientHeight,t.object.matrix)}else t.object.isOrthographicCamera?($(q*(t.object.right-t.object.left)/t.object.zoom/ue.clientWidth,t.object.matrix),se(Q*(t.object.top-t.object.bottom)/t.object.zoom/ue.clientHeight,t.object.matrix)):t.enablePan=!1}}();function ce(O){t.object.isPerspectiveCamera||t.object.isOrthographicCamera?l/=O:t.enableZoom=!1}function re(O){t.object.isPerspectiveCamera||t.object.isOrthographicCamera?l*=O:t.enableZoom=!1}function de(O,q){if(!t.zoomToCursor)return;Y=!0;const Q=t.domElement.getBoundingClientRect(),ue=O-Q.left,me=q-Q.top,Ae=Q.width,Re=Q.height;P.x=ue/Ae*2-1,P.y=-me/Re*2+1,b.set(P.x,P.y,1).unproject(t.object).sub(t.object.position).normalize()}function E(O){return Math.max(t.minDistance,Math.min(t.maxDistance,O))}function g(O){u.set(O.clientX,O.clientY)}function T(O){p.set(O.clientX,O.clientY)}function U(O){if(D.length===1)u.set(O.pageX,O.pageY);else{const q=oe(O),Q=.5*(O.pageX+q.x),ue=.5*(O.pageY+q.y);u.set(Q,ue)}}function C(O){if(D.length===1)p.set(O.pageX,O.pageY);else{const q=oe(O),Q=.5*(O.pageX+q.x),ue=.5*(O.pageY+q.y);p.set(Q,ue)}}function W(O){const q=oe(O),Q=O.pageX-q.x,ue=O.pageY-q.y,me=Math.sqrt(Q*Q+ue*ue);f.set(0,me)}function k(O){if(D.length==1)h.set(O.pageX,O.pageY);else{const Q=oe(O),ue=.5*(O.pageX+Q.x),me=.5*(O.pageY+Q.y);h.set(ue,me)}d.subVectors(h,u).multiplyScalar(t.rotateSpeed);const q=t.domElement;K(2*Math.PI*d.x/q.clientHeight),ae(2*Math.PI*d.y/q.clientHeight),u.copy(h)}function M(O){if(D.length===1)v.set(O.pageX,O.pageY);else{const q=oe(O),Q=.5*(O.pageX+q.x),ue=.5*(O.pageY+q.y);v.set(Q,ue)}x.subVectors(v,p).multiplyScalar(t.panSpeed),J(x.x,x.y),p.copy(v)}function S(O){const q=oe(O),Q=O.pageX-q.x,ue=O.pageY-q.y,me=Math.sqrt(Q*Q+ue*ue);_.set(0,me),m.set(0,Math.pow(_.y/f.y,t.zoomSpeed)),ce(m.y),f.copy(_),de(.5*(O.pageX+q.x),.5*(O.pageY+q.y))}function L(O){t.enabled!==!1&&(D.length===0&&(t.domElement.setPointerCapture(O.pointerId),t.domElement.addEventListener("pointermove",R),t.domElement.addEventListener("pointerup",I)),function(q){for(let Q=0;Q<D.length;Q++)if(D[Q]==q.pointerId)return!0;return!1}(O)||(function(q){D.push(q.pointerId)}(O),O.pointerType==="touch"?V(O):function(q){let Q;switch(q.button){case 0:Q=t.mouseButtons.LEFT;break;case 1:Q=t.mouseButtons.MIDDLE;break;case 2:Q=t.mouseButtons.RIGHT;break;default:Q=-1}switch(Q){case Ys:if(t.enableZoom===!1)return;(function(ue){de(ue.clientX,ue.clientX),f.set(ue.clientX,ue.clientY)})(q),i=n.DOLLY;break;case Hn:if(q.ctrlKey||q.metaKey||q.shiftKey){if(t.enablePan===!1)return;T(q),i=n.PAN}else{if(t.enableRotate===!1)return;g(q),i=n.ROTATE}break;case Ks:if(q.ctrlKey||q.metaKey||q.shiftKey){if(t.enableRotate===!1)return;g(q),i=n.ROTATE}else{if(t.enablePan===!1)return;T(q),i=n.PAN}break;default:i=n.NONE}i!==n.NONE&&t.dispatchEvent(Rs)}(O)))}function R(O){t.enabled!==!1&&(O.pointerType==="touch"?function(q){switch(ne(q),i){case n.TOUCH_ROTATE:if(t.enableRotate===!1)return;k(q),t.update();break;case n.TOUCH_PAN:if(t.enablePan===!1)return;M(q),t.update();break;case n.TOUCH_DOLLY_PAN:if(t.enableZoom===!1&&t.enablePan===!1)return;(function(Q){t.enableZoom&&S(Q),t.enablePan&&M(Q)})(q),t.update();break;case n.TOUCH_DOLLY_ROTATE:if(t.enableZoom===!1&&t.enableRotate===!1)return;(function(Q){t.enableZoom&&S(Q),t.enableRotate&&k(Q)})(q),t.update();break;default:i=n.NONE}}(O):function(q){switch(i){case n.ROTATE:if(t.enableRotate===!1)return;(function(Q){h.set(Q.clientX,Q.clientY),d.subVectors(h,u).multiplyScalar(t.rotateSpeed);const ue=t.domElement;K(2*Math.PI*d.x/ue.clientHeight),ae(2*Math.PI*d.y/ue.clientHeight),u.copy(h),t.update()})(q);break;case n.DOLLY:if(t.enableZoom===!1)return;(function(Q){_.set(Q.clientX,Q.clientY),m.subVectors(_,f),m.y>0?ce(j(m.y)):m.y<0&&re(j(m.y)),f.copy(_),t.update()})(q);break;case n.PAN:if(t.enablePan===!1)return;(function(Q){v.set(Q.clientX,Q.clientY),x.subVectors(v,p).multiplyScalar(t.panSpeed),J(x.x,x.y),p.copy(v),t.update()})(q)}}(O))}function I(O){switch(function(q){delete G[q.pointerId];for(let Q=0;Q<D.length;Q++)if(D[Q]==q.pointerId)return void D.splice(Q,1)}(O),D.length){case 0:t.domElement.releasePointerCapture(O.pointerId),t.domElement.removeEventListener("pointermove",R),t.domElement.removeEventListener("pointerup",I),t.dispatchEvent(Hl),i=n.NONE;break;case 1:const q=D[0],Q=G[q];V({pointerId:q,pageX:Q.x,pageY:Q.y})}}function F(O){t.enabled!==!1&&t.enableZoom!==!1&&i===n.NONE&&(O.preventDefault(),t.dispatchEvent(Rs),function(q){de(q.clientX,q.clientY),q.deltaY<0?re(j(q.deltaY)):q.deltaY>0&&ce(j(q.deltaY)),t.update()}(function(q){const Q=q.deltaMode,ue={clientX:q.clientX,clientY:q.clientY,deltaY:q.deltaY};switch(Q){case 1:ue.deltaY*=16;break;case 2:ue.deltaY*=100}return q.ctrlKey&&!X&&(ue.deltaY*=10),ue}(O)),t.dispatchEvent(Hl))}function y(O){O.key==="Control"&&(X=!0,t.domElement.getRootNode().addEventListener("keyup",N,{passive:!0,capture:!0}))}function N(O){O.key==="Control"&&(X=!1,t.domElement.getRootNode().removeEventListener("keyup",N,{passive:!0,capture:!0}))}function w(O){t.enabled!==!1&&t.enablePan!==!1&&function(q){let Q=!1;switch(q.code){case t.keys.UP:q.ctrlKey||q.metaKey||q.shiftKey?ae(2*Math.PI*t.rotateSpeed/t.domElement.clientHeight):J(0,t.keyPanSpeed),Q=!0;break;case t.keys.BOTTOM:q.ctrlKey||q.metaKey||q.shiftKey?ae(-2*Math.PI*t.rotateSpeed/t.domElement.clientHeight):J(0,-t.keyPanSpeed),Q=!0;break;case t.keys.LEFT:q.ctrlKey||q.metaKey||q.shiftKey?K(2*Math.PI*t.rotateSpeed/t.domElement.clientHeight):J(t.keyPanSpeed,0),Q=!0;break;case t.keys.RIGHT:q.ctrlKey||q.metaKey||q.shiftKey?K(-2*Math.PI*t.rotateSpeed/t.domElement.clientHeight):J(-t.keyPanSpeed,0),Q=!0}Q&&(q.preventDefault(),t.update())}(O)}function V(O){switch(ne(O),D.length){case 1:switch(t.touches.ONE){case Zs:if(t.enableRotate===!1)return;U(O),i=n.TOUCH_ROTATE;break;case mc:if(t.enablePan===!1)return;C(O),i=n.TOUCH_PAN;break;default:i=n.NONE}break;case 2:switch(t.touches.TWO){case Js:if(t.enableZoom===!1&&t.enablePan===!1)return;(function(q){t.enableZoom&&W(q),t.enablePan&&C(q)})(O),i=n.TOUCH_DOLLY_PAN;break;case gc:if(t.enableZoom===!1&&t.enableRotate===!1)return;(function(q){t.enableZoom&&W(q),t.enableRotate&&U(q)})(O),i=n.TOUCH_DOLLY_ROTATE;break;default:i=n.NONE}break;default:i=n.NONE}i!==n.NONE&&t.dispatchEvent(Rs)}function B(O){t.enabled!==!1&&O.preventDefault()}function ne(O){let q=G[O.pointerId];q===void 0&&(q=new _e,G[O.pointerId]=q),q.set(O.pageX,O.pageY)}function oe(O){const q=O.pointerId===D[0]?D[1]:D[0];return G[q]}t.domElement.addEventListener("contextmenu",B),t.domElement.addEventListener("pointerdown",L),t.domElement.addEventListener("pointercancel",I),t.domElement.addEventListener("wheel",F,{passive:!1}),t.domElement.getRootNode().addEventListener("keydown",y,{passive:!0,capture:!0}),this.update()}}(kn,Gt);rc.enableDamping=!0;const fn=new class{constructor(r={}){const{canvas:e=eu(),context:t=null,depth:n=!0,stencil:i=!1,alpha:a=!1,antialias:s=!1,premultipliedAlpha:o=!0,preserveDrawingBuffer:l=!1,powerPreference:c="default",failIfMajorPerformanceCaveat:u=!1}=r;let h;if(this.isWebGLRenderer=!0,t!==null){if(typeof WebGLRenderingContext<"u"&&t instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");h=t.getContextAttributes().alpha}else h=a;const d=new Uint32Array(4),p=new Int32Array(4);let v=null,x=null;const f=[],_=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=_t,this.toneMapping=Rn,this.toneMappingExposure=1;const m=this;let b=!1,P=0,Y=0,D=null,G=-1,X=null;const j=new je,K=new je;let ae=null;const $=new Se(0);let se=0,J=e.width,ce=e.height,re=1,de=null,E=null;const g=new je(0,0,J,ce),T=new je(0,0,J,ce);let U=!1;const C=new ns;let W=!1,k=!1;const M=new Pe,S=new z,L={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let R=!1;function I(){return D===null?re:1}let F,y,N,w,V,B,ne,oe,O,q,Q,ue,me,Ae,Re,fe,we,ge,We,ve,Te,be,Ye,ot,H=t;function ft(A,Z){return e.getContext(A,Z)}try{const A={alpha:!0,depth:n,stencil:i,antialias:s,premultipliedAlpha:o,preserveDrawingBuffer:l,powerPreference:c,failIfMajorPerformanceCaveat:u};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Zi}`),e.addEventListener("webglcontextlost",En,!1),e.addEventListener("webglcontextrestored",ri,!1),e.addEventListener("webglcontextcreationerror",ai,!1),H===null){const Z="webgl2";if(H=ft(Z,A),H===null)throw ft(Z)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(A){throw A}function zt(){F=new Cu(H),F.init(),be=new Zh(H,F),y=new wu(H,F,r,be),N=new Yh(H),w=new Du(H),V=new Fh,B=new Kh(H,F,N,V,y,be,w),ne=new Eu(m),oe=new Ru(m),O=new yu(H),Ye=new Mu(H,O),q=new Pu(H,O,w,Ye),Q=new Iu(H,q,O,w),We=new Uu(H,y,B),fe=new Au(V),ue=new Oh(m,ne,oe,F,y,Ye,fe),me=new nd(m,V),Ae=new zh,Re=new Wh(F),ge=new Su(m,ne,oe,N,Q,h,o),we=new qh(m,Q,y),ot=new id(H,w,y,N),ve=new Tu(H,F,w),Te=new Lu(H,F,w),w.programs=ue.programs,m.capabilities=y,m.extensions=F,m.properties=V,m.renderLists=Ae,m.shadowMap=we,m.state=N,m.info=w}zt();const Ke=new ed(m,H);function En(A){A.preventDefault(),b=!0}function ri(){b=!1;const A=w.autoReset,Z=we.enabled,te=we.autoUpdate,le=we.needsUpdate,ie=we.type;zt(),w.autoReset=A,we.enabled=Z,we.autoUpdate=te,we.needsUpdate=le,we.type=ie}function ai(A){}function qi(A){const Z=A.target;Z.removeEventListener("dispose",qi),function(te){(function(le){const ie=V.get(le).programs;ie!==void 0&&(ie.forEach(function(he){ue.releaseProgram(he)}),le.isShaderMaterial&&ue.releaseShaderCache(le))})(te),V.remove(te)}(Z)}function mt(A,Z,te){A.transparent===!0&&A.side===2&&A.forceSinglePass===!1?(A.side=Lt,A.needsUpdate=!0,jt(A,Z,te),A.side=xn,A.needsUpdate=!0,jt(A,Z,te),A.side=2):jt(A,Z,te)}this.xr=Ke,this.getContext=function(){return H},this.getContextAttributes=function(){return H.getContextAttributes()},this.forceContextLoss=function(){const A=F.get("WEBGL_lose_context");A&&A.loseContext()},this.forceContextRestore=function(){const A=F.get("WEBGL_lose_context");A&&A.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(A){A!==void 0&&(re=A,this.setSize(J,ce,!1))},this.getSize=function(A){return A.set(J,ce)},this.setSize=function(A,Z,te=!0){Ke.isPresenting||(J=A,ce=Z,e.width=Math.floor(A*re),e.height=Math.floor(Z*re),te===!0&&(e.style.width=A+"px",e.style.height=Z+"px"),this.setViewport(0,0,A,Z))},this.getDrawingBufferSize=function(A){return A.set(J*re,ce*re).floor()},this.setDrawingBufferSize=function(A,Z,te){J=A,ce=Z,re=te,e.width=Math.floor(A*te),e.height=Math.floor(Z*te),this.setViewport(0,0,A,Z)},this.getCurrentViewport=function(A){return A.copy(j)},this.getViewport=function(A){return A.copy(g)},this.setViewport=function(A,Z,te,le){A.isVector4?g.set(A.x,A.y,A.z,A.w):g.set(A,Z,te,le),N.viewport(j.copy(g).multiplyScalar(re).round())},this.getScissor=function(A){return A.copy(T)},this.setScissor=function(A,Z,te,le){A.isVector4?T.set(A.x,A.y,A.z,A.w):T.set(A,Z,te,le),N.scissor(K.copy(T).multiplyScalar(re).round())},this.getScissorTest=function(){return U},this.setScissorTest=function(A){N.setScissorTest(U=A)},this.setOpaqueSort=function(A){de=A},this.setTransparentSort=function(A){E=A},this.getClearColor=function(A){return A.copy(ge.getClearColor())},this.setClearColor=function(){ge.setClearColor.apply(ge,arguments)},this.getClearAlpha=function(){return ge.getClearAlpha()},this.setClearAlpha=function(){ge.setClearAlpha.apply(ge,arguments)},this.clear=function(A=!0,Z=!0,te=!0){let le=0;if(A){let ie=!1;if(D!==null){const he=D.texture.format;ie=he===1033||he===1031||he===1029}if(ie){const he=D.texture.type,xe=he===ui||he===hi||he===Dr||he===di||he===1017||he===1018,ye=ge.getClearColor(),Me=ge.getClearAlpha(),Ce=ye.r,Ue=ye.g,Ee=ye.b;xe?(d[0]=Ce,d[1]=Ue,d[2]=Ee,d[3]=Me,H.clearBufferuiv(H.COLOR,0,d)):(p[0]=Ce,p[1]=Ue,p[2]=Ee,p[3]=Me,H.clearBufferiv(H.COLOR,0,p))}else le|=H.COLOR_BUFFER_BIT}Z&&(le|=H.DEPTH_BUFFER_BIT),te&&(le|=H.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),H.clear(le)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",En,!1),e.removeEventListener("webglcontextrestored",ri,!1),e.removeEventListener("webglcontextcreationerror",ai,!1),Ae.dispose(),Re.dispose(),V.dispose(),ne.dispose(),oe.dispose(),Q.dispose(),Ye.dispose(),ot.dispose(),ue.dispose(),Ke.dispose(),Ke.removeEventListener("sessionstart",wr),Ke.removeEventListener("sessionend",Yi),Xe.stop()},this.renderBufferDirect=function(A,Z,te,le,ie,he){Z===null&&(Z=L);const xe=ie.isMesh&&ie.matrixWorld.determinant()<0,ye=function(ke,tt,kt,Fe,Ie){tt.isScene!==!0&&(tt=L),B.resetTextureUnits();const Er=tt.fog,rf=Fe.isMeshStandardMaterial?tt.environment:null,af=D===null?m.outputColorSpace:D.isXRRenderTarget===!0?D.texture.colorSpace:yt,wa=(Fe.isMeshStandardMaterial?oe:ne).get(Fe.envMap||rf),sf=Fe.vertexColors===!0&&!!kt.attributes.color&&kt.attributes.color.itemSize===4,of=!!kt.attributes.tangent&&(!!Fe.normalMap||Fe.anisotropy>0),lf=!!kt.morphAttributes.position,cf=!!kt.morphAttributes.normal,uf=!!kt.morphAttributes.color;let hc=Rn;Fe.toneMapped&&(D!==null&&D.isXRRenderTarget!==!0||(hc=m.toneMapping));const dc=kt.morphAttributes.position||kt.morphAttributes.normal||kt.morphAttributes.color,hf=dc!==void 0?dc.length:0,Be=V.get(Fe),df=x.state.lights;if(W===!0&&(k===!0||ke!==X)){const Xt=ke===X&&Fe.id===G;fe.setState(Fe,ke,Xt)}let tn=!1;Fe.version===Be.__version?Be.needsLights&&Be.lightsStateVersion!==df.state.version||Be.outputColorSpace!==af||Ie.isBatchedMesh&&Be.batching===!1?tn=!0:Ie.isBatchedMesh||Be.batching!==!0?Ie.isBatchedMesh&&Be.batchingColor===!0&&Ie.colorTexture===null||Ie.isBatchedMesh&&Be.batchingColor===!1&&Ie.colorTexture!==null||Ie.isInstancedMesh&&Be.instancing===!1?tn=!0:Ie.isInstancedMesh||Be.instancing!==!0?Ie.isSkinnedMesh&&Be.skinning===!1?tn=!0:Ie.isSkinnedMesh||Be.skinning!==!0?Ie.isInstancedMesh&&Be.instancingColor===!0&&Ie.instanceColor===null||Ie.isInstancedMesh&&Be.instancingColor===!1&&Ie.instanceColor!==null||Ie.isInstancedMesh&&Be.instancingMorph===!0&&Ie.morphTexture===null||Ie.isInstancedMesh&&Be.instancingMorph===!1&&Ie.morphTexture!==null||Be.envMap!==wa||Fe.fog===!0&&Be.fog!==Er?tn=!0:Be.numClippingPlanes===void 0||Be.numClippingPlanes===fe.numPlanes&&Be.numIntersection===fe.numIntersection?(Be.vertexAlphas!==sf||Be.vertexTangents!==of||Be.morphTargets!==lf||Be.morphNormals!==cf||Be.morphColors!==uf||Be.toneMapping!==hc||Be.morphTargetsCount!==hf)&&(tn=!0):tn=!0:tn=!0:tn=!0:tn=!0:(tn=!0,Be.__version=Fe.version);let si=Be.currentProgram;tn===!0&&(si=jt(Fe,tt,Ie));let pc=!1,Rr=!1,js=!1;const xt=si.getUniforms(),Vn=Be.uniforms;if(N.useProgram(si.program)&&(pc=!0,Rr=!0,js=!0),Fe.id!==G&&(G=Fe.id,Rr=!0),pc||X!==ke){xt.setValue(H,"projectionMatrix",ke.projectionMatrix),xt.setValue(H,"viewMatrix",ke.matrixWorldInverse);const Xt=xt.map.cameraPosition;Xt!==void 0&&Xt.setValue(H,S.setFromMatrixPosition(ke.matrixWorld)),y.logarithmicDepthBuffer&&xt.setValue(H,"logDepthBufFC",2/(Math.log(ke.far+1)/Math.LN2)),(Fe.isMeshPhongMaterial||Fe.isMeshToonMaterial||Fe.isMeshLambertMaterial||Fe.isMeshBasicMaterial||Fe.isMeshStandardMaterial||Fe.isShaderMaterial)&&xt.setValue(H,"isOrthographic",ke.isOrthographicCamera===!0),X!==ke&&(X=ke,Rr=!0,js=!0)}if(Ie.isSkinnedMesh){xt.setOptional(H,Ie,"bindMatrix"),xt.setOptional(H,Ie,"bindMatrixInverse");const Xt=Ie.skeleton;Xt&&(Xt.boneTexture===null&&Xt.computeBoneTexture(),xt.setValue(H,"boneTexture",Xt.boneTexture,B))}Ie.isBatchedMesh&&(xt.setOptional(H,Ie,"batchingTexture"),xt.setValue(H,"batchingTexture",Ie._matricesTexture,B),xt.setOptional(H,Ie,"batchingColorTexture"),Ie._colorsTexture!==null&&xt.setValue(H,"batchingColorTexture",Ie._colorsTexture,B));const Xs=kt.morphAttributes;Xs.position===void 0&&Xs.normal===void 0&&Xs.color===void 0||We.update(Ie,kt,si),(Rr||Be.receiveShadow!==Ie.receiveShadow)&&(Be.receiveShadow=Ie.receiveShadow,xt.setValue(H,"receiveShadow",Ie.receiveShadow)),Fe.isMeshGouraudMaterial&&Fe.envMap!==null&&(Vn.envMap.value=wa,Vn.flipEnvMap.value=wa.isCubeTexture&&wa.isRenderTargetTexture===!1?-1:1),Fe.isMeshStandardMaterial&&Fe.envMap===null&&tt.environment!==null&&(Vn.envMapIntensity.value=tt.environmentIntensity),Rr&&(xt.setValue(H,"toneMappingExposure",m.toneMappingExposure),Be.needsLights&&(nn=js,(gn=Vn).ambientLightColor.needsUpdate=nn,gn.lightProbe.needsUpdate=nn,gn.directionalLights.needsUpdate=nn,gn.directionalLightShadows.needsUpdate=nn,gn.pointLights.needsUpdate=nn,gn.pointLightShadows.needsUpdate=nn,gn.spotLights.needsUpdate=nn,gn.spotLightShadows.needsUpdate=nn,gn.rectAreaLights.needsUpdate=nn,gn.hemisphereLights.needsUpdate=nn),Er&&Fe.fog===!0&&me.refreshFogUniforms(Vn,Er),me.refreshMaterialUniforms(Vn,Fe,re,ce,x.state.transmissionRenderTarget[ke.id]),ca.upload(H,Ki(Be),Vn,B));var gn,nn;if(Fe.isShaderMaterial&&Fe.uniformsNeedUpdate===!0&&(ca.upload(H,Ki(Be),Vn,B),Fe.uniformsNeedUpdate=!1),Fe.isSpriteMaterial&&xt.setValue(H,"center",Ie.center),xt.setValue(H,"modelViewMatrix",Ie.modelViewMatrix),xt.setValue(H,"normalMatrix",Ie.normalMatrix),xt.setValue(H,"modelMatrix",Ie.matrixWorld),Fe.isShaderMaterial||Fe.isRawShaderMaterial){const Xt=Fe.uniformsGroups;for(let qs=0,pf=Xt.length;qs<pf;qs++){const fc=Xt[qs];ot.update(fc,si),ot.bind(fc,si)}}return si}(A,Z,te,le,ie);N.setMaterial(le,xe);let Me=te.index,Ce=1;if(le.wireframe===!0){if(Me=q.getWireframeAttribute(te),Me===void 0)return;Ce=2}const Ue=te.drawRange,Ee=te.attributes.position;let ze=Ue.start*Ce,Qe=(Ue.start+Ue.count)*Ce;he!==null&&(ze=Math.max(ze,he.start*Ce),Qe=Math.min(Qe,(he.start+he.count)*Ce)),Me!==null?(ze=Math.max(ze,0),Qe=Math.min(Qe,Me.count)):Ee!=null&&(ze=Math.max(ze,0),Qe=Math.min(Qe,Ee.count));const ct=Qe-ze;if(ct<0||ct===1/0)return;let gt;Ye.setup(ie,le,ye,te,Me);let $e=ve;if(Me!==null&&(gt=O.get(Me),$e=Te,$e.setIndex(gt)),ie.isMesh)le.wireframe===!0?(N.setLineWidth(le.wireframeLinewidth*I()),$e.setMode(H.LINES)):$e.setMode(H.TRIANGLES);else if(ie.isLine){let ke=le.linewidth;ke===void 0&&(ke=1),N.setLineWidth(ke*I()),ie.isLineSegments?$e.setMode(H.LINES):ie.isLineLoop?$e.setMode(H.LINE_LOOP):$e.setMode(H.LINE_STRIP)}else ie.isPoints?$e.setMode(H.POINTS):ie.isSprite&&$e.setMode(H.TRIANGLES);if(ie.isBatchedMesh)ie._multiDrawInstances!==null?$e.renderMultiDrawInstances(ie._multiDrawStarts,ie._multiDrawCounts,ie._multiDrawCount,ie._multiDrawInstances):$e.renderMultiDraw(ie._multiDrawStarts,ie._multiDrawCounts,ie._multiDrawCount);else if(ie.isInstancedMesh)$e.renderInstances(ze,ct,ie.count);else if(te.isInstancedBufferGeometry){const ke=te._maxInstanceCount!==void 0?te._maxInstanceCount:1/0,tt=Math.min(te.instanceCount,ke);$e.renderInstances(ze,ct,tt)}else $e.render(ze,ct)},this.compile=function(A,Z,te=null){te===null&&(te=A),x=Re.get(te),x.init(Z),_.push(x),te.traverseVisible(function(ie){ie.isLight&&ie.layers.test(Z.layers)&&(x.pushLight(ie),ie.castShadow&&x.pushShadow(ie))}),A!==te&&A.traverseVisible(function(ie){ie.isLight&&ie.layers.test(Z.layers)&&(x.pushLight(ie),ie.castShadow&&x.pushShadow(ie))}),x.setupLights();const le=new Set;return A.traverse(function(ie){const he=ie.material;if(he)if(Array.isArray(he))for(let xe=0;xe<he.length;xe++){const ye=he[xe];mt(ye,te,ie),le.add(ye)}else mt(he,te,ie),le.add(he)}),_.pop(),x=null,le},this.compileAsync=function(A,Z,te=null){const le=this.compile(A,Z,te);return new Promise(ie=>{function he(){le.forEach(function(xe){V.get(xe).currentProgram.isReady()&&le.delete(xe)}),le.size!==0?setTimeout(he,10):ie(A)}F.get("KHR_parallel_shader_compile")!==null?he():setTimeout(he,10)})};let Tr=null;function wr(){Xe.stop()}function Yi(){Xe.start()}const Xe=new Io;function Dt(A,Z,te,le){if(A.visible===!1)return;if(A.layers.test(Z.layers)){if(A.isGroup)te=A.renderOrder;else if(A.isLOD)A.autoUpdate===!0&&A.update(Z);else if(A.isLight)x.pushLight(A),A.castShadow&&x.pushShadow(A);else if(A.isSprite){if(!A.frustumCulled||C.intersectsSprite(A)){le&&S.setFromMatrixPosition(A.matrixWorld).applyMatrix4(M);const he=Q.update(A),xe=A.material;xe.visible&&v.push(A,he,xe,te,S.z,null)}}else if((A.isMesh||A.isLine||A.isPoints)&&(!A.frustumCulled||C.intersectsObject(A))){const he=Q.update(A),xe=A.material;if(le&&(A.boundingSphere!==void 0?(A.boundingSphere===null&&A.computeBoundingSphere(),S.copy(A.boundingSphere.center)):(he.boundingSphere===null&&he.computeBoundingSphere(),S.copy(he.boundingSphere.center)),S.applyMatrix4(A.matrixWorld).applyMatrix4(M)),Array.isArray(xe)){const ye=he.groups;for(let Me=0,Ce=ye.length;Me<Ce;Me++){const Ue=ye[Me],Ee=xe[Ue.materialIndex];Ee&&Ee.visible&&v.push(A,he,Ee,te,S.z,Ue)}}else xe.visible&&v.push(A,he,xe,te,S.z,null)}}const ie=A.children;for(let he=0,xe=ie.length;he<xe;he++)Dt(ie[he],Z,te,le)}function Ct(A,Z,te,le){const ie=A.opaque,he=A.transmissive,xe=A.transparent;x.setupLightsView(te),W===!0&&fe.setGlobalState(m.clippingPlanes,te),le&&N.viewport(j.copy(le)),ie.length>0&&lt(ie,Z,te),he.length>0&&lt(he,Z,te),xe.length>0&&lt(xe,Z,te),N.buffers.depth.setTest(!0),N.buffers.depth.setMask(!0),N.buffers.color.setMask(!0),N.setPolygonOffset(!1)}function Pt(A,Z,te,le){if((te.isScene===!0?te.overrideMaterial:null)!==null)return;x.state.transmissionRenderTarget[le.id]===void 0&&(x.state.transmissionRenderTarget[le.id]=new Tt(1,1,{generateMipmaps:!0,type:F.has("EXT_color_buffer_half_float")||F.has("EXT_color_buffer_float")?rn:ui,minFilter:Wn,samples:4,stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Ve.workingColorSpace}));const ie=x.state.transmissionRenderTarget[le.id],he=le.viewport||j;ie.setSize(he.z,he.w);const xe=m.getRenderTarget();m.setRenderTarget(ie),m.getClearColor($),se=m.getClearAlpha(),se<1&&m.setClearColor(16777215,.5),R?ge.render(te):m.clear();const ye=m.toneMapping;m.toneMapping=Rn;const Me=le.viewport;if(le.viewport!==void 0&&(le.viewport=void 0),x.setupLightsView(le),W===!0&&fe.setGlobalState(m.clippingPlanes,le),lt(A,te,le),B.updateMultisampleRenderTarget(ie),B.updateRenderTargetMipmap(ie),F.has("WEBGL_multisampled_render_to_texture")===!1){let Ce=!1;for(let Ue=0,Ee=Z.length;Ue<Ee;Ue++){const ze=Z[Ue],Qe=ze.object,ct=ze.geometry,gt=ze.material,$e=ze.group;if(gt.side===2&&Qe.layers.test(le.layers)){const ke=gt.side;gt.side=Lt,gt.needsUpdate=!0,Wt(Qe,te,le,ct,gt,$e),gt.side=ke,gt.needsUpdate=!0,Ce=!0}}Ce===!0&&(B.updateMultisampleRenderTarget(ie),B.updateRenderTargetMipmap(ie))}m.setRenderTarget(xe),m.setClearColor($,se),Me!==void 0&&(le.viewport=Me),m.toneMapping=ye}function lt(A,Z,te){const le=Z.isScene===!0?Z.overrideMaterial:null;for(let ie=0,he=A.length;ie<he;ie++){const xe=A[ie],ye=xe.object,Me=xe.geometry,Ce=le===null?xe.material:le,Ue=xe.group;ye.layers.test(te.layers)&&Wt(ye,Z,te,Me,Ce,Ue)}}function Wt(A,Z,te,le,ie,he){A.onBeforeRender(m,Z,te,le,ie,he),A.modelViewMatrix.multiplyMatrices(te.matrixWorldInverse,A.matrixWorld),A.normalMatrix.getNormalMatrix(A.modelViewMatrix),ie.onBeforeRender(m,Z,te,le,A,he),ie.transparent===!0&&ie.side===2&&ie.forceSinglePass===!1?(ie.side=Lt,ie.needsUpdate=!0,m.renderBufferDirect(te,Z,le,ie,A,he),ie.side=xn,ie.needsUpdate=!0,m.renderBufferDirect(te,Z,le,ie,A,he),ie.side=2):m.renderBufferDirect(te,Z,le,ie,A,he),A.onAfterRender(m,Z,te,le,ie,he)}function jt(A,Z,te){Z.isScene!==!0&&(Z=L);const le=V.get(A),ie=x.state.lights,he=x.state.shadowsArray,xe=ie.state.version,ye=ue.getParameters(A,ie.state,he,Z,te),Me=ue.getProgramCacheKey(ye);let Ce=le.programs;le.environment=A.isMeshStandardMaterial?Z.environment:null,le.fog=Z.fog,le.envMap=(A.isMeshStandardMaterial?oe:ne).get(A.envMap||le.environment),le.envMapRotation=le.environment!==null&&A.envMap===null?Z.environmentRotation:A.envMapRotation,Ce===void 0&&(A.addEventListener("dispose",qi),Ce=new Map,le.programs=Ce);let Ue=Ce.get(Me);if(Ue!==void 0){if(le.currentProgram===Ue&&le.lightsStateVersion===xe)return Ar(A,ye),Ue}else ye.uniforms=ue.getUniforms(A),A.onBuild(te,ye,m),A.onBeforeCompile(ye,m),Ue=ue.acquireProgram(ye,Me),Ce.set(Me,Ue),le.uniforms=ye.uniforms;const Ee=le.uniforms;return(A.isShaderMaterial||A.isRawShaderMaterial)&&A.clipping!==!0||(Ee.clippingPlanes=fe.uniform),Ar(A,ye),le.needsLights=function(ze){return ze.isMeshLambertMaterial||ze.isMeshToonMaterial||ze.isMeshPhongMaterial||ze.isMeshStandardMaterial||ze.isShadowMaterial||ze.isShaderMaterial&&ze.lights===!0}(A),le.lightsStateVersion=xe,le.needsLights&&(Ee.ambientLightColor.value=ie.state.ambient,Ee.lightProbe.value=ie.state.probe,Ee.directionalLights.value=ie.state.directional,Ee.directionalLightShadows.value=ie.state.directionalShadow,Ee.spotLights.value=ie.state.spot,Ee.spotLightShadows.value=ie.state.spotShadow,Ee.rectAreaLights.value=ie.state.rectArea,Ee.ltc_1.value=ie.state.rectAreaLTC1,Ee.ltc_2.value=ie.state.rectAreaLTC2,Ee.pointLights.value=ie.state.point,Ee.pointLightShadows.value=ie.state.pointShadow,Ee.hemisphereLights.value=ie.state.hemi,Ee.directionalShadowMap.value=ie.state.directionalShadowMap,Ee.directionalShadowMatrix.value=ie.state.directionalShadowMatrix,Ee.spotShadowMap.value=ie.state.spotShadowMap,Ee.spotLightMatrix.value=ie.state.spotLightMatrix,Ee.spotLightMap.value=ie.state.spotLightMap,Ee.pointShadowMap.value=ie.state.pointShadowMap,Ee.pointShadowMatrix.value=ie.state.pointShadowMatrix),le.currentProgram=Ue,le.uniformsList=null,Ue}function Ki(A){if(A.uniformsList===null){const Z=A.currentProgram.getUniforms();A.uniformsList=ca.seqWithValue(Z.seq,A.uniforms)}return A.uniformsList}function Ar(A,Z){const te=V.get(A);te.outputColorSpace=Z.outputColorSpace,te.batching=Z.batching,te.batchingColor=Z.batchingColor,te.instancing=Z.instancing,te.instancingColor=Z.instancingColor,te.instancingMorph=Z.instancingMorph,te.skinning=Z.skinning,te.morphTargets=Z.morphTargets,te.morphNormals=Z.morphNormals,te.morphColors=Z.morphColors,te.morphTargetsCount=Z.morphTargetsCount,te.numClippingPlanes=Z.numClippingPlanes,te.numIntersection=Z.numClipIntersection,te.vertexAlphas=Z.vertexAlphas,te.vertexTangents=Z.vertexTangents,te.toneMapping=Z.toneMapping}Xe.setAnimationLoop(function(A){Tr&&Tr(A)}),typeof self<"u"&&Xe.setContext(self),this.setAnimationLoop=function(A){Tr=A,Ke.setAnimationLoop(A),A===null?Xe.stop():Xe.start()},Ke.addEventListener("sessionstart",wr),Ke.addEventListener("sessionend",Yi),this.render=function(A,Z){if(Z!==void 0&&Z.isCamera!==!0||b===!0)return;if(A.matrixWorldAutoUpdate===!0&&A.updateMatrixWorld(),Z.parent===null&&Z.matrixWorldAutoUpdate===!0&&Z.updateMatrixWorld(),Ke.enabled===!0&&Ke.isPresenting===!0&&(Ke.cameraAutoUpdate===!0&&Ke.updateCamera(Z),Z=Ke.getCamera()),A.isScene===!0&&A.onBeforeRender(m,A,Z,D),x=Re.get(A,_.length),x.init(Z),_.push(x),M.multiplyMatrices(Z.projectionMatrix,Z.matrixWorldInverse),C.setFromProjectionMatrix(M),k=this.localClippingEnabled,W=fe.init(this.clippingPlanes,k),v=Ae.get(A,f.length),v.init(),f.push(v),Ke.enabled===!0&&Ke.isPresenting===!0){const he=m.xr.getDepthSensingMesh();he!==null&&Dt(he,Z,-1/0,m.sortObjects)}Dt(A,Z,0,m.sortObjects),v.finish(),m.sortObjects===!0&&v.sort(de,E),R=Ke.enabled===!1||Ke.isPresenting===!1||Ke.hasDepthSensing()===!1,R&&ge.addToRenderList(v,A),this.info.render.frame++,W===!0&&fe.beginShadows();const te=x.state.shadowsArray;we.render(te,A,Z),W===!0&&fe.endShadows(),this.info.autoReset===!0&&this.info.reset();const le=v.opaque,ie=v.transmissive;if(x.setupLights(),Z.isArrayCamera){const he=Z.cameras;if(ie.length>0)for(let xe=0,ye=he.length;xe<ye;xe++)Pt(le,ie,A,he[xe]);R&&ge.render(A);for(let xe=0,ye=he.length;xe<ye;xe++){const Me=he[xe];Ct(v,A,Me,Me.viewport)}}else ie.length>0&&Pt(le,ie,A,Z),R&&ge.render(A),Ct(v,A,Z);D!==null&&(B.updateMultisampleRenderTarget(D),B.updateRenderTargetMipmap(D)),A.isScene===!0&&A.onAfterRender(m,A,Z),Ye.resetDefaultState(),G=-1,X=null,_.pop(),_.length>0?(x=_[_.length-1],W===!0&&fe.setGlobalState(m.clippingPlanes,x.state.camera)):x=null,f.pop(),v=f.length>0?f[f.length-1]:null},this.getActiveCubeFace=function(){return P},this.getActiveMipmapLevel=function(){return Y},this.getRenderTarget=function(){return D},this.setRenderTargetTextures=function(A,Z,te){V.get(A.texture).__webglTexture=Z,V.get(A.depthTexture).__webglTexture=te;const le=V.get(A);le.__hasExternalTextures=!0,le.__autoAllocateDepthBuffer=te===void 0,le.__autoAllocateDepthBuffer||F.has("WEBGL_multisampled_render_to_texture")===!0&&(le.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(A,Z){const te=V.get(A);te.__webglFramebuffer=Z,te.__useDefaultFramebuffer=Z===void 0},this.setRenderTarget=function(A,Z=0,te=0){D=A,P=Z,Y=te;let le=!0,ie=null,he=!1,xe=!1;if(A){const ye=V.get(A);ye.__useDefaultFramebuffer!==void 0?(N.bindFramebuffer(H.FRAMEBUFFER,null),le=!1):ye.__webglFramebuffer===void 0?B.setupRenderTarget(A):ye.__hasExternalTextures&&B.rebindTextures(A,V.get(A.texture).__webglTexture,V.get(A.depthTexture).__webglTexture);const Me=A.texture;(Me.isData3DTexture||Me.isDataArrayTexture||Me.isCompressedArrayTexture)&&(xe=!0);const Ce=V.get(A).__webglFramebuffer;A.isWebGLCubeRenderTarget?(ie=Array.isArray(Ce[Z])?Ce[Z][te]:Ce[Z],he=!0):ie=A.samples>0&&B.useMultisampledRTT(A)===!1?V.get(A).__webglMultisampledFramebuffer:Array.isArray(Ce)?Ce[te]:Ce,j.copy(A.viewport),K.copy(A.scissor),ae=A.scissorTest}else j.copy(g).multiplyScalar(re).floor(),K.copy(T).multiplyScalar(re).floor(),ae=U;if(N.bindFramebuffer(H.FRAMEBUFFER,ie)&&le&&N.drawBuffers(A,ie),N.viewport(j),N.scissor(K),N.setScissorTest(ae),he){const ye=V.get(A.texture);H.framebufferTexture2D(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ye.__webglTexture,te)}else if(xe){const ye=V.get(A.texture),Me=Z||0;H.framebufferTextureLayer(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,ye.__webglTexture,te||0,Me)}G=-1},this.readRenderTargetPixels=function(A,Z,te,le,ie,he,xe){if(!A||!A.isWebGLRenderTarget)return;let ye=V.get(A).__webglFramebuffer;if(A.isWebGLCubeRenderTarget&&xe!==void 0&&(ye=ye[xe]),ye){N.bindFramebuffer(H.FRAMEBUFFER,ye);try{const Me=A.texture,Ce=Me.format,Ue=Me.type;if(!y.textureFormatReadable(Ce)||!y.textureTypeReadable(Ue))return;Z>=0&&Z<=A.width-le&&te>=0&&te<=A.height-ie&&H.readPixels(Z,te,le,ie,be.convert(Ce),be.convert(Ue),he)}finally{const Me=D!==null?V.get(D).__webglFramebuffer:null;N.bindFramebuffer(H.FRAMEBUFFER,Me)}}},this.readRenderTargetPixelsAsync=async function(A,Z,te,le,ie,he,xe){if(!A||!A.isWebGLRenderTarget)throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ye=V.get(A).__webglFramebuffer;if(A.isWebGLCubeRenderTarget&&xe!==void 0&&(ye=ye[xe]),ye){N.bindFramebuffer(H.FRAMEBUFFER,ye);try{const Me=A.texture,Ce=Me.format,Ue=Me.type;if(!y.textureFormatReadable(Ce))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!y.textureTypeReadable(Ue))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(Z>=0&&Z<=A.width-le&&te>=0&&te<=A.height-ie){const Ee=H.createBuffer();H.bindBuffer(H.PIXEL_PACK_BUFFER,Ee),H.bufferData(H.PIXEL_PACK_BUFFER,he.byteLength,H.STREAM_READ),H.readPixels(Z,te,le,ie,be.convert(Ce),be.convert(Ue),0),H.flush();const ze=H.fenceSync(H.SYNC_GPU_COMMANDS_COMPLETE,0);await function(Qe,ct,gt){return new Promise(function($e,ke){setTimeout(function tt(){switch(Qe.clientWaitSync(ct,Qe.SYNC_FLUSH_COMMANDS_BIT,0)){case Qe.WAIT_FAILED:ke();break;case Qe.TIMEOUT_EXPIRED:setTimeout(tt,gt);break;default:$e()}},gt)})}(H,ze,4);try{H.bindBuffer(H.PIXEL_PACK_BUFFER,Ee),H.getBufferSubData(H.PIXEL_PACK_BUFFER,0,he)}finally{H.deleteBuffer(Ee),H.deleteSync(ze)}return he}}finally{const Me=D!==null?V.get(D).__webglFramebuffer:null;N.bindFramebuffer(H.FRAMEBUFFER,Me)}}},this.copyFramebufferToTexture=function(A,Z=null,te=0){A.isTexture!==!0&&(Z=arguments[0]||null,A=arguments[1]);const le=Math.pow(2,-te),ie=Math.floor(A.image.width*le),he=Math.floor(A.image.height*le),xe=Z!==null?Z.x:0,ye=Z!==null?Z.y:0;B.setTexture2D(A,0),H.copyTexSubImage2D(H.TEXTURE_2D,te,0,0,xe,ye,ie,he),N.unbindTexture()},this.copyTextureToTexture=function(A,Z,te=null,le=null,ie=0){let he,xe,ye,Me,Ce,Ue;A.isTexture!==!0&&(le=arguments[0]||null,A=arguments[1],Z=arguments[2],ie=arguments[3]||0,te=null),te!==null?(he=te.max.x-te.min.x,xe=te.max.y-te.min.y,ye=te.min.x,Me=te.min.y):(he=A.image.width,xe=A.image.height,ye=0,Me=0),le!==null?(Ce=le.x,Ue=le.y):(Ce=0,Ue=0);const Ee=be.convert(Z.format),ze=be.convert(Z.type);B.setTexture2D(Z,0),H.pixelStorei(H.UNPACK_FLIP_Y_WEBGL,Z.flipY),H.pixelStorei(H.UNPACK_PREMULTIPLY_ALPHA_WEBGL,Z.premultiplyAlpha),H.pixelStorei(H.UNPACK_ALIGNMENT,Z.unpackAlignment);const Qe=H.getParameter(H.UNPACK_ROW_LENGTH),ct=H.getParameter(H.UNPACK_IMAGE_HEIGHT),gt=H.getParameter(H.UNPACK_SKIP_PIXELS),$e=H.getParameter(H.UNPACK_SKIP_ROWS),ke=H.getParameter(H.UNPACK_SKIP_IMAGES),tt=A.isCompressedTexture?A.mipmaps[ie]:A.image;H.pixelStorei(H.UNPACK_ROW_LENGTH,tt.width),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,tt.height),H.pixelStorei(H.UNPACK_SKIP_PIXELS,ye),H.pixelStorei(H.UNPACK_SKIP_ROWS,Me),A.isDataTexture?H.texSubImage2D(H.TEXTURE_2D,ie,Ce,Ue,he,xe,Ee,ze,tt.data):A.isCompressedTexture?H.compressedTexSubImage2D(H.TEXTURE_2D,ie,Ce,Ue,tt.width,tt.height,Ee,tt.data):H.texSubImage2D(H.TEXTURE_2D,ie,Ce,Ue,Ee,ze,tt),H.pixelStorei(H.UNPACK_ROW_LENGTH,Qe),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,ct),H.pixelStorei(H.UNPACK_SKIP_PIXELS,gt),H.pixelStorei(H.UNPACK_SKIP_ROWS,$e),H.pixelStorei(H.UNPACK_SKIP_IMAGES,ke),ie===0&&Z.generateMipmaps&&H.generateMipmap(H.TEXTURE_2D),N.unbindTexture()},this.copyTextureToTexture3D=function(A,Z,te=null,le=null,ie=0){let he,xe,ye,Me,Ce,Ue,Ee,ze,Qe;A.isTexture!==!0&&(te=arguments[0]||null,le=arguments[1]||null,A=arguments[2],Z=arguments[3],ie=arguments[4]||0);const ct=A.isCompressedTexture?A.mipmaps[ie]:A.image;te!==null?(he=te.max.x-te.min.x,xe=te.max.y-te.min.y,ye=te.max.z-te.min.z,Me=te.min.x,Ce=te.min.y,Ue=te.min.z):(he=ct.width,xe=ct.height,ye=ct.depth,Me=0,Ce=0,Ue=0),le!==null?(Ee=le.x,ze=le.y,Qe=le.z):(Ee=0,ze=0,Qe=0);const gt=be.convert(Z.format),$e=be.convert(Z.type);let ke;if(Z.isData3DTexture)B.setTexture3D(Z,0),ke=H.TEXTURE_3D;else{if(!Z.isDataArrayTexture&&!Z.isCompressedArrayTexture)return;B.setTexture2DArray(Z,0),ke=H.TEXTURE_2D_ARRAY}H.pixelStorei(H.UNPACK_FLIP_Y_WEBGL,Z.flipY),H.pixelStorei(H.UNPACK_PREMULTIPLY_ALPHA_WEBGL,Z.premultiplyAlpha),H.pixelStorei(H.UNPACK_ALIGNMENT,Z.unpackAlignment);const tt=H.getParameter(H.UNPACK_ROW_LENGTH),kt=H.getParameter(H.UNPACK_IMAGE_HEIGHT),Fe=H.getParameter(H.UNPACK_SKIP_PIXELS),Ie=H.getParameter(H.UNPACK_SKIP_ROWS),Er=H.getParameter(H.UNPACK_SKIP_IMAGES);H.pixelStorei(H.UNPACK_ROW_LENGTH,ct.width),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,ct.height),H.pixelStorei(H.UNPACK_SKIP_PIXELS,Me),H.pixelStorei(H.UNPACK_SKIP_ROWS,Ce),H.pixelStorei(H.UNPACK_SKIP_IMAGES,Ue),A.isDataTexture||A.isData3DTexture?H.texSubImage3D(ke,ie,Ee,ze,Qe,he,xe,ye,gt,$e,ct.data):Z.isCompressedArrayTexture?H.compressedTexSubImage3D(ke,ie,Ee,ze,Qe,he,xe,ye,gt,ct.data):H.texSubImage3D(ke,ie,Ee,ze,Qe,he,xe,ye,gt,$e,ct),H.pixelStorei(H.UNPACK_ROW_LENGTH,tt),H.pixelStorei(H.UNPACK_IMAGE_HEIGHT,kt),H.pixelStorei(H.UNPACK_SKIP_PIXELS,Fe),H.pixelStorei(H.UNPACK_SKIP_ROWS,Ie),H.pixelStorei(H.UNPACK_SKIP_IMAGES,Er),ie===0&&Z.generateMipmaps&&H.generateMipmap(ke),N.unbindTexture()},this.initRenderTarget=function(A){V.get(A).__webglFramebuffer===void 0&&B.setupRenderTarget(A)},this.initTexture=function(A){A.isCubeTexture?B.setTextureCube(A,0):A.isData3DTexture?B.setTexture3D(A,0):A.isDataArrayTexture||A.isCompressedArrayTexture?B.setTexture2DArray(A,0):B.setTexture2D(A,0),N.unbindTexture()},this.resetState=function(){P=0,Y=0,D=null,N.reset(),Ye.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return gi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(r){this._outputColorSpace=r;const e=this.getContext();e.drawingBufferColorSpace=r===Ua?"display-p3":"srgb",e.unpackColorSpace=Ve.workingColorSpace===Ir?"display-p3":"srgb"}}({canvas:Gt,context:Xp,antialias:!0});fn.setSize(et.width,et.height),fn.setPixelRatio(et.pixelRatio),fn.xr.enabled=!0,Vs.backgroundColor="#000000",fn.setClearColor(Vs.backgroundColor);const ac=function(r,e,t,n){const i=new Tt(800,600,{samples:r.getPixelRatio()===1?2:0}),a=new Dp(r,i);a.setPixelRatio(n.pixelRatio),a.setSize(n.width,n.height);const s=new Up(e,t);a.addPass(s);const o=new Wi;o.enabled=!0,a.addPass(o),o.strength=.36,o.radius=-2,o.threshold=.4;const l=new Ql(Np);if(a.addPass(l),r.getPixelRatio()===1&&!r.capabilities.isWebGL2){const c=new Op;a.addPass(c)}return{effectComposer:a,unrealBloomPass:o}}(fn,Ma,kn,et),Hs=ac.effectComposer,qp=ac.unrealBloomPass,Yp=new Ll().load("assets/channelORANGE.png",()=>{fn.setSize(window.innerWidth,window.innerHeight)}),Kp=new Ot({map:Yp}),Zp=new cn(2,2),br=new at(Zp,Kp);br.position.set(-4,1.5,-6),br.scale.multiplyScalar(6),br.lookAt(kn.position),br.visible=!1,Ma.add(br);let Sr={count:15e5,radius:3,threshold:.05,surfaceRatio:.33,surfaceThreshold:.01};const Gs={count:Sr.count,positions:new Float32Array(3*Sr.count)},Jp=new Float32Array(3*Gs.count),Qp=await ic.loadAsync("./glb/Baryon_v2.glb"),Rt={};Rt.instance=Qp.scene.children[0],Rt.instance.scale.set(.2,.2,.2),Rt.instance.updateMatrix(),Rt.instance.geometry.applyMatrix4(Rt.instance.matrix),Rt.instance.matrix.identity(),Rt.instance.matrix.decompose(Rt.instance.position,Rt.instance.quaternion,Rt.instance.scale),Rt.geometry=Rt.instance.geometry,Rt.count=Rt.geometry.attributes.position.count,function(r){ee.listener=new Dd,r.add(ee.listener),ee.sound=new Bl(ee.listener),ee.sound.started=!1,ee.audioCtx=ee.listener.context,Bp(new Pd),ee.analyser=new zl(ee.sound,ee.fftSize)}(kn);const sc=function(r,e,t,n){const i={};i.size=Math.ceil(Math.sqrt(r.count)),i.computation=new Vp(i.size,i.size,e);const a=i.computation.createTexture();r.positions=function(_,m,b){const P=new Float32Array(3*_),Y=Math.floor(_*b),D=(1+Math.sqrt(5))/2,G=2*Math.PI*D;for(let X=0;X<Y;X++){const j=X/Y,K=Math.acos(1-2*j),ae=G*X,$=m*Math.sin(K)*Math.cos(ae),se=m*Math.sin(K)*Math.sin(ae),J=m*Math.cos(K);P[3*X]=$,P[3*X+1]=se,P[3*X+2]=J}for(let X=Y;X<_;X++){const j=Math.pow(Math.random(),.3333333333333333)*m,K=Math.random()*Math.PI*2,ae=Math.acos(2*Math.random()-1),$=j*Math.sin(ae)*Math.cos(K),se=j*Math.sin(ae)*Math.sin(K),J=j*Math.cos(ae);P[3*X]=$,P[3*X+1]=se,P[3*X+2]=J}return P}(t.count,t.radius,t.surfaceRatio);for(let _=0;_<r.count;_++){const m=3*_,b=4*_;a.image.data[b+0]=r.positions[m+0],a.image.data[b+1]=r.positions[m+1],a.image.data[b+2]=r.positions[m+2],a.image.data[b+3]=1}const s=i.computation.createTexture();for(let _=0;_<n.count;_++){const m=3*_,b=4*_;s.image.data[b+0]=n.geometry.attributes.position.array[m+0],s.image.data[b+1]=n.geometry.attributes.position.array[m+1],s.image.data[b+2]=n.geometry.attributes.position.array[m+2],s.image.data[b+3]=Math.random()}const o=i.computation.createTexture(),l=function(_,m){const b=m/10,P=new Float32Array(3*_);for(let Y=0;Y<_;Y++){const D=Math.pow(Math.random(),.3333333333333333)*b,G=Math.random()*Math.PI*2,X=Math.acos(2*Math.random()-1),j=D*Math.sin(X)*Math.cos(G),K=D*Math.sin(X)*Math.sin(G),ae=D*Math.cos(X);P[3*Y]=j,P[3*Y+1]=K,P[3*Y+2]=ae}return P}(t.count,t.radius);for(let _=0;_<r.count;_++){const m=3*_,b=4*_;o.image.data[b+0]=l[m+0],o.image.data[b+1]=l[m+1],o.image.data[b+2]=l[m+2],o.image.data[b+3]=1}const c={pitches:{value:function(_){const m=new Float32Array(_);for(let b=0;b<_;b++)m[b]=200+2e3*Math.random();return m}(ee.capacity)}},u=i.computation.createTexture();i.audioDataVariable=i.computation.addVariable("uAudioData",`float random2D(vec2 value) {
    return fract(sin(dot(value.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
#define MAX_N 20

uniform float uRadius;

uniform sampler2D tPitches;
uniform sampler2D tDataArray;

uniform float sampleRate;
uniform float bufferSize;
uniform int capacity;
uniform float uRandomPitches[MAX_N];

const float SOUND_SPEED_AIR = 340.0;

const float TOLERANCE = 1.0;
const int MAX_ITERATIONS = 200;

ivec3 findNormalModes(float pitch) {
    float c = SOUND_SPEED_AIR;
    float l = uRadius;
    float invL2 = 1.0 / (l * l);

    ivec3 n0 = ivec3(1);
    ivec3 n1 = ivec3(2);

    for(int i = 0; i < MAX_ITERATIONS; i++) {
        vec3 n0Vec = vec3(n0);
        vec3 n1Vec = vec3(n1);

        float v0 = 0.5 * c * sqrt(dot(n0Vec, n0Vec) * invL2);
        float v1 = 0.5 * c * sqrt(dot(n1Vec, n1Vec) * invL2);

        if(abs(v1 - pitch) < TOLERANCE || abs(v1 - v0) < 0.0001) {
            break;
        }

        vec3 n2 = n1Vec - (v1 - pitch) * (n1Vec - n0Vec) / (v1 - v0);
        n1 = ivec3(round(n2));
        n0 = n1;
    }

    return n1;
}

float frequencyToIndex(float pitch) {
    float nyquist = sampleRate / 2.0;

    return (pitch / nyquist) * (bufferSize / 2.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    
    
    
    
    

    
    
    
    

    
    float pitch = texture(tPitches, vec2(uv.x, 0.5)).r;
    float index2 = frequencyToIndex(pitch);

    
    float normalizedIndex = clamp(index2 / (bufferSize / 2.0), 0.0, 1.0); 

    
    float amplitude = texture(tDataArray, vec2(normalizedIndex, 0.5)).r;

    ivec3 modeNumbers = findNormalModes(pitch);

    gl_FragColor = vec4(vec3(modeNumbers), amplitude);

}`,u);const h=e.capabilities.isWebGL2?Ur:1024;let d=new Float32Array(ee.capacity);i.audioDataVariable.material.uniforms.tPitches={value:new hr(d,ee.capacity,1,Ur,It)},i.audioDataVariable.material.uniforms.tDataArray={value:new hr(ee.analyser.data,ee.fftSize/2,1,h)},i.audioDataVariable.material.uniforms.uRadius=new Ne(t.radius),i.audioDataVariable.material.uniforms.sampleRate=new Ne(ee.audioCtx.sampleRate),i.audioDataVariable.material.uniforms.bufferSize=new Ne(ee.fftSize),i.audioDataVariable.material.uniforms.capacity=new Ne(ee.capacity),i.audioDataVariable.material.uniforms.uRandomPitches=c.pitches,i.computation.setVariableDependencies(i.audioDataVariable,[]);const p=i.computation.createTexture();i.scalarFieldVariable=i.computation.addVariable("uScalarField",`#define PI 3.14159265359

uniform sampler2D uBase;
uniform float uRadius;
uniform int capacity;

float chladni(vec3 position, float radius) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;

    for(int i = 0; i < capacity; ++i) {
        vec2 uv = vec2((float(i) + 0.5) / float(capacity), 0.5);
        vec4 waveData = texture(uAudioData, uv);

        float Ai = waveData.w;
        float ui = waveData.x;
        float vi = waveData.y;
        float wi = waveData.z;

        sum += Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    }

    return sum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 base = texture(uBase, uv);
    vec3 position = base.xyz;

    float value = chladni(position, uRadius);

    gl_FragColor = vec4(position, value);
}`,p),i.scalarFieldVariable.material.uniforms.uRadius=new Ne(t.radius),i.scalarFieldVariable.material.uniforms.uBase=new Ne(a),i.scalarFieldVariable.material.uniforms.capacity=new Ne(ee.capacity),i.computation.setVariableDependencies(i.scalarFieldVariable,[i.audioDataVariable]),i.zeroPointsVariable=i.computation.addVariable("uZeroPoints",`uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;
uniform float uAverageAmplitude;
uniform bool uSurfaceControl;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;
    float distance = length(position);
    

    
    
    
    

    if(abs(scalarValue) >= uThreshold) {
        discard;
    }

    bool isOnSurface = abs(distance - uRadius) <= uSurfaceThreshold;

    if(isOnSurface && uSurfaceControl) {
        gl_FragColor = vec4(position, 1.0); 
    } else if(isOnSurface && !uSurfaceControl) {
        discard; 
    } else {
        gl_FragColor = vec4(position, 2.0); 
    }
}`,i.computation.createTexture()),i.zeroPointsVariable.material.uniforms.uThreshold=new Ne(t.threshold),i.zeroPointsVariable.material.uniforms.uRadius=new Ne(t.radius),i.zeroPointsVariable.material.uniforms.uSurfaceThreshold=new Ne(t.surfaceThreshold),i.zeroPointsVariable.material.uniforms.uSurfaceControl=new Ne(!0),i.zeroPointsVariable.material.uniforms.uAverageAmplitude=new Ne(0),i.computation.setVariableDependencies(i.zeroPointsVariable,[i.scalarFieldVariable]),i.particlesVariable=i.computation.addVariable("uParticles",`vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}

vec4 grad4(float j, vec4 ip){
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p,s;

  p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www; 

  return p;
}

float simplexNoise4d(vec4 v){
  const vec2  C = vec2( 0.138196601125010504,  
                        0.309016994374947451); 

  vec4 i  = floor(v + dot(v, C.yyyy) );
  vec4 x0 = v -   i + dot(i, C.xxxx);

  vec4 i0;

  vec3 isX = step( x0.yzw, x0.xxx );
  vec3 isYZ = step( x0.zww, x0.yyz );

  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;

  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;

  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  
  vec4 i3 = clamp( i0, 0.0, 1.0 );
  vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
  vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );

  
  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;

  i = mod(i, 289.0); 
  float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute( permute( permute( permute (
             i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
           + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
           + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
           + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));

  vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;

  vec4 p0 = grad4(j0,   ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4,p4));

  vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
               + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;

}

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uParticleSpeed;
uniform float uThreshold;
uniform float uAverageAmplitude;
uniform float vGroup;
uniform bool uStarted;
uniform bool uMicActive;
uniform int uParticleMovementType;
uniform float uRadius;
uniform float uDistanceThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 base = texture(uBase, uv);
    vec4 zeroPoint = texture(uZeroPoints, uv);

    
    particle.w = zeroPoint.a;

    vec3 target = (uAverageAmplitude > 0.0) ? zeroPoint.xyz : base.xyz;

    float distance = length(target - particle.xyz);
    vec3 direction = normalize(target - particle.xyz);

    
    
    
    

    
    

    
    float strength = simplexNoise4d(vec4(target * 0.2, uTime + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
    strength = smoothstep(influence, 1.0, strength);

    
    vec3 flowField = normalize(vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, uTime)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, uTime))));

    vec3 adjustedDirection = direction + flowField * strength;
    vec3 movement = adjustedDirection * uDeltaTime * uFlowFieldStrength;

    vec3 lerpMovement = vec3(0.0);
    if(distance > uDistanceThreshold) {
        float timeFactor = clamp(uParticleSpeed * uDeltaTime, 0.0, 1.0);
        float alpha = timeFactor;

        if(uParticleMovementType == 1 && uStarted) {
            float distanceFactor = smoothstep(0.0, 1.0, 1.0 - distance / (distance + 1.0));
            alpha = mix(distanceFactor, 1.0, timeFactor);
        }

        
        float dampingFactor = 1.0 - exp(-distance * 5.0);  
        alpha *= dampingFactor;

        vec3 interpolatedPosition = mix(particle.xyz, target, alpha);
        lerpMovement = interpolatedPosition - particle.xyz;
    }

    particle.xyz += movement + lerpMovement;

    gl_FragColor = particle;
}`,a),i.particlesVariable.material.uniforms.uTime=new Ne(0),i.particlesVariable.material.uniforms.uDeltaTime=new Ne(0),i.particlesVariable.material.uniforms.uFlowFieldInfluence=new Ne(1),i.particlesVariable.material.uniforms.uFlowFieldStrength=new Ne(3.6),i.particlesVariable.material.uniforms.uFlowFieldFrequency=new Ne(.64),i.particlesVariable.material.uniforms.uThreshold=new Ne(t.threshold),i.particlesVariable.material.uniforms.uBase=new Ne(s),i.particlesVariable.material.uniforms.uAverageAmplitude=new Ne(0),i.particlesVariable.material.uniforms.uParticleSpeed=new Ne(32),i.particlesVariable.material.uniforms.uStarted=new Ne(ee.sound.started),i.particlesVariable.material.uniforms.uParticleMovementType=new Ne(1),i.particlesVariable.material.uniforms.uRadius=new Ne(t.radius),i.particlesVariable.material.uniforms.uDistanceThreshold=new Ne(.5),i.particlesVariable.material.uniforms.uMicActive=new Ne(ee.gumStream&&ee.gumStream.active),i.computation.setVariableDependencies(i.particlesVariable,[i.zeroPointsVariable,i.particlesVariable]),i.computation.init();let v=!1;i.audioDebug=new at(new cn(3,3),new Ot({map:i.computation.getCurrentRenderTarget(i.audioDataVariable).texture})),i.audioDebug.visible=v,i.audioDebug.position.x=-4,i.audioDebug.position.y=2;const x=new at(new cn(3,3),new Ot({map:i.computation.getCurrentRenderTarget(i.scalarFieldVariable).texture}));x.visible=v,x.position.x=-4,x.position.y=1;const f=new at(new cn(3,3),new Ot({map:i.computation.getCurrentRenderTarget(i.zeroPointsVariable).texture}));return f.visible=v,f.position.x=-4,f.position.y=-1,i.particlesDebug=new at(new cn(3,3),new Ot({map:i.computation.getCurrentRenderTarget(i.particlesVariable).texture})),i.particlesDebug.visible=v,i.particlesDebug.position.x=-4,i.particlesDebug.position.y=-2,{gpgpu:i,essentiaData:d}}(Gs,fn,Sr,Rt),st=sc.gpgpu,$p=sc.essentiaData,oc=function(r,e,t,n,i,a){const s={},o={};o.color=new Se("rgb(5, 134, 255)"),s.material=new ht({side:2,blending:2,vertexShader:`float random2D(vec2 value) {
    return fract(sin(dot(value.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
precision mediump float;

uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uTime;
uniform float uDeltaTime;
uniform float uAverageAmplitude;
uniform float uRadius;
uniform float uRotation;
uniform bool uSoundPlaying;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;

varying float vGroup;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    vGroup = particle.w;

    
    vec3 normal = normalize(particle.xyz);

    
    float normalizedAmplitude = uAverageAmplitude / 255.0;
    float maxDistance = uRadius * 1.5;
    vec3 pulsatingOffset = normal * normalizedAmplitude * maxDistance;
    particle.xyz += pulsatingOffset;

    
    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);

    
    
    
    
    
    
    

    
    
    
    
    
    
    
    

    
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    
    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);

    
    
    float restingSize = uSize * uResolution.y;
    restingSize *= (1.0 / -viewPosition.z);

    
    float sizeMultiplier = 1.0 + (length(pulsatingOffset) / uRadius);

    
    gl_PointSize = restingSize * sizeMultiplier;

    
    vPosition = modelPosition.xyz;
    
    vNormal = modelNormal.xyz;
}`,fragmentShader:`float random2D(vec2 value) {
    return fract(sin(dot(value.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
precision mediump float;

varying float vGroup;
varying vec3 vPosition;
uniform float uTime;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uRadius;

void main() {
    
    float distanceToCenter = length(gl_PointCoord - 0.5);
    
    if(distanceToCenter > 0.5)
        discard;

    

    vec3 normal = normalize(vNormal);
    normal = gl_FrontFacing ? normal : -normal;

    
    float stripes = mod((vPosition.y - uTime * 0.02) * 20.0, 1.0);
    stripes = pow(stripes, 3.0);

    
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    float fresnel = 1.0 - dot(viewDirection, normal);
    fresnel = pow(fresnel, 2.0);

    vec3 holographicColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), fresnel);

    
    float falloff = smoothstep(0.8, 0.0, fresnel);

    
    float holographic = fresnel * stripes;
    holographic += fresnel * 1.25;
    holographic *= falloff;

    
    vec3 color;
    if(vGroup == 1.0) {
        color = vec3(0.87059, 0.93333, 0.98039);
        
    } else if(vGroup == 2.0) {
        
        
        
        
        
        
        color = uColor;
    } else if(vGroup == 0.0) {
        color = vec3(0.35686, 0.57255, 0.96078);
    }

    float alpha = 1.0;
    vec3 finalColor = mix(color, holographicColor, holographic);
    gl_FragColor = vec4(finalColor, alpha);
    

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`,uniforms:{uSize:new Ne(.03),uResolution:new Ne(new _e(e.width*e.pixelRatio,e.height*e.pixelRatio)),uParticlesTexture:new Ne,uTime:new Ne(0),uColor:new Ne(new Se(o.color)),uRadius:new Ne(r.radius),uAverageAmplitude:new Ne(0),uRotation:new Ne(2.5),uDeltaTime:new Ne(0),uSoundPlaying:new Ne(ee.sound.isPlaying)}}),s.material.uniforms.uParticlesTexture.value=t.computation.getCurrentRenderTarget(t.particlesVariable).texture;const l=new Float32Array(2*n.count),c=new Float32Array(n.count);for(let u=0;u<t.size;u++)for(let h=0;h<t.size;h++){const d=u*t.size+h,p=2*d,v=(h+.5)/t.size,x=(u+.5)/t.size;l[p+0]=v,l[p+1]=x,c[d]=Math.random()}return s.geometry=new Bt,s.geometry.setDrawRange(0,n.count),s.geometry.setAttribute("aParticlesUv",new rt(l,2)),s.geometry.setAttribute("aColor",new rt(i,3)),s.geometry.setAttribute("aSize",new rt(c,1)),s.points=new Al(s.geometry,s.material),a.add(s.points),{particles:s,materialParameters:o}}(Sr,et,st,Gs,Jp,Ma),mn=oc.particles,ef=oc.materialParameters;(function(r,e,t,n,i,a,s,o){r.close();const l=r.addFolder("Bloom Effect");l.add(e,"enabled").name("Enable Bloom"),l.add(e,"strength").min(0).max(2).step(.001).name("Bloom Strength"),l.add(e,"radius").min(-5).max(5).step(.001).name("Bloom Radius"),l.add(e,"threshold").min(0).max(1).step(.001).name("Bloom Threshold"),l.close();const c=r.addFolder("Color Settings");c.addColor(a,"backgroundColor").name("Background Color").onChange(()=>{t.setClearColor(a.backgroundColor)}),c.addColor(s,"color").name("Volume Color").onChange(()=>{n.material.uniforms.uColor.value.set(s.color)}),c.close();const u=r.addFolder("Granular Controls");u.add(i.particlesVariable.material.uniforms.uFlowFieldInfluence,"value").min(.01).max(1).step(.001).name("FlowField Influence"),u.add(i.particlesVariable.material.uniforms.uFlowFieldStrength,"value").min(.01).max(10).step(.001).name("FlowField Strength"),u.add(i.particlesVariable.material.uniforms.uFlowFieldFrequency,"value").min(.01).max(1).step(.001).name("FlowField Frequency"),u.add(i.particlesVariable.material.uniforms.uParticleSpeed,"value").min(1).max(200).step(.001).name("Particle Speed"),u.add(i.particlesVariable.material.uniforms.uDistanceThreshold,"value").min(0).max(5).step(.001).name("Target Lerp Threshold"),u.add(o,"threshold").min(.001).max(.5).step(.001).name("Zero-Point Precision").onChange(()=>{i.zeroPointsVariable.material.uniforms.uThreshold.value=o.threshold,i.particlesVariable.material.uniforms.uThreshold.value=o.threshold}),u.close();const h=r.addFolder("Aesthetics");h.add(n.material.uniforms.uSize,"value").min(0).max(1).step(.001).name("Particle Size"),h.add(n.material.uniforms.uRotation,"value").min(0).max(10).step(.001).name("Rotation Speed"),h.add(i.zeroPointsVariable.material.uniforms.uSurfaceControl,"value").name("Surface Particles").onChange(function(d){i.zeroPointsVariable.material.uniforms.uSurfaceControl.value=d}),h.add(i.particlesVariable.material.uniforms.uParticleMovementType,"value",{Quickest:0,Smoothed:1}).name("Particle Movement Type").onChange(function(d){i.particlesVariable.material.uniforms.uParticleMovementType.value=d}),h.close()})(jp,qp,fn,mn,st,Vs,ef,Sr),ji.addEventListener("click",()=>Wp(Gt,ee.audioCtx,ee.gain)),ji.disabled=!1,window.addEventListener("resize",()=>{et.width=window.innerWidth,et.height=window.innerHeight,et.pixelRatio=Math.min(window.devicePixelRatio,2),mn.material.uniforms.uResolution.value.set(et.width*et.pixelRatio,et.height*et.pixelRatio),kn.aspect=et.width/et.height,kn.updateProjectionMatrix(),fn.setSize(et.width,et.height),fn.setPixelRatio(et.pixelRatio),Hs.setSize(et.width,et.height),Hs.setPixelRatio(et.pixelRatio)}),window.addEventListener("beforeunload",()=>{(function(r){r.computation.dispose(),r.particlesVariable.material.dispose(),r.audioDataVariable.material.dispose(),r.scalarFieldVariable.material.dispose(),r.zeroPointsVariable.material.dispose(),r.particlesDebug.material.dispose(),r.audioDebug.material.dispose(),r.scalarFieldDebug.material.dispose(),r.zeroPointsDebug.material.dispose()})(st)}),document.addEventListener("keydown",function(r){r.key==="f"&&(document.fullscreenElement?document.exitFullscreen?document.exitFullscreen():document.mozCancelFullScreen?document.mozCancelFullScreen():document.webkitExitFullscreen?document.webkitExitFullscreen():document.msExitFullscreen&&document.msExitFullscreen():Gt.requestFullscreen?Gt.requestFullscreen():Gt.mozRequestFullScreen?Gt.mozRequestFullScreen():Gt.webkitRequestFullscreen?Gt.webkitRequestFullscreen():Gt.msRequestFullscreen&&Gt.msRequestFullscreen())}),/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)&&function(){const r=document.createElement("div");r.style.position="fixed",r.style.top="0",r.style.left="0",r.style.width="100%",r.style.height="100%",r.style.display="flex",r.style.alignItems="center",r.style.justifyContent="center",r.style.backgroundColor="#000",r.style.color="white",r.style.fontSize="24px",r.style.zIndex="1000",r.style.textAlign="center",r.style.padding="0px";const e=document.createElement("div");e.textContent="Please view this site on desktop. Mobile & tablet is not supported at the moment.",e.style.maxWidth="90%",r.appendChild(e),document.body.appendChild(r)}();const tf=new ws;let Ta=0,Xi=0,Mr=0;const lc=new Pe;let cc=0;function nf(r){return ee.gumStream&&ee.gumStream.active?(Mr=r-Ta,Ta=r,Xi=r):ee.sound.isPlaying&&ee.sound.started?(Mr=ee.sound.listener.timeDelta,Xi=ee.sound.context.currentTime,cc=Xi):!ee.sound.isPlaying&&ee.sound.started?(Xi=cc,Mr=0):(Mr=r-Ta,Ta=r,Xi=r),{time:Xi,deltaTime:Mr}}const uc=()=>{const r=tf.getElapsedTime(),{time:e,deltaTime:t}=nf(r);rc.update(t),st.particlesVariable.material.uniforms.uTime.value=e,st.particlesVariable.material.uniforms.uDeltaTime.value=t,st.particlesVariable.material.uniforms.uStarted.value=ee.sound.started,st.particlesVariable.material.uniforms.uMicActive.value=ee.gumStream&&ee.gumStream.active,mn.material.uniforms.uSoundPlaying.value=ee.sound.isPlaying,mn.material.uniforms.uTime.value=e,mn.material.uniforms.uDeltaTime.value=t,function(i,a,s){ee.audioReader.available_read()>=1&&ee.audioReader.dequeue(s)!==0&&(i.audioDataVariable.material.uniforms.tPitches.value.needsUpdate=!0);const o=ee.sound.isPlaying,l=ee.gumStream&&ee.gumStream.active;if(o||l){const{avgAmplitude:c,freqData:u}=zp();i.zeroPointsVariable.material.uniforms.uAverageAmplitude.value=c,i.particlesVariable.material.uniforms.uAverageAmplitude.value=c,a.material.uniforms.uAverageAmplitude.value=c,i.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(u),i.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate=!0}else o||l||ee.sound.started||(i.zeroPointsVariable.material.uniforms.uAverageAmplitude.value=0,i.particlesVariable.material.uniforms.uAverageAmplitude.value=0,a.material.uniforms.uAverageAmplitude.value=0,i.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(0),i.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate=!0)}(st,mn,$p),st.computation.compute(),st.scalarFieldVariable.material.uniforms.uAudioData.value=st.computation.getCurrentRenderTarget(st.audioDataVariable).texture,st.zeroPointsVariable.material.uniforms.uScalarField.value=st.computation.getCurrentRenderTarget(st.scalarFieldVariable).texture,st.particlesVariable.material.uniforms.uZeroPoints.value=st.computation.getCurrentRenderTarget(st.zeroPointsVariable).texture,mn.material.uniforms.uParticlesTexture.value=st.computation.getCurrentRenderTarget(st.particlesVariable).texture;const n=.5*e*mn.material.uniforms.uRotation.value;lc.makeRotationY(-n),mn.points.matrix.copy(lc),mn.points.matrixAutoUpdate=!1,Hs.render(),window.requestAnimationFrame(uc)};var Ws;Ws=uc,kp().then(()=>{(function(){if(!window.SharedArrayBuffer)return void alert("SharedArrayBuffer is not supported in this browser. Please use a compatible browser.");let r=Aa.RingBuffer.getStorageForCapacity(ee.capacity,Float32Array),e=new Aa.RingBuffer(r,Float32Array);ee.audioReader=new Aa.AudioReader(e),ee.essentiaNode=new AudioWorkletNode(ee.audioCtx,"audio-data-processor",{processorOptions:{bufferSize:ee.fftSize,sampleRate:ee.audioCtx.sampleRate,capacity:ee.capacity}}),ee.essentiaNode.port.onmessageerror=t=>{};try{ee.essentiaNode.port.postMessage({sab:r,isPlaying:ee.sound.isPlaying,micActive:ee.gumStream&&ee.gumStream.active})}catch{return void alert("No SharedArrayBuffer tranfer support, try another browser.")}ee.sound.getOutput().connect(ee.essentiaNode),ee.gain=ee.audioCtx.createGain(),ee.essentiaNode.connect(ee.gain),ee.gain.connect(ee.audioCtx.destination)})(),Ws&&Ws()}).catch(r=>{})})()});export default mf();
