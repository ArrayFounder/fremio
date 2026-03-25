import{At as e,Ct as t,Dt as n,Et as r,Ft as i,Mt as a,Nt as o,Ot as s,Pt as c,St as l,Tt as u,_t as d,bt as f,gt as p,ht as m,jt as h,kt as ee,vt as te,wt as ne,xt as re,yt as ie}from"./index-mn6eoz9w-K3VJOEz_.js";
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
var g=`firebasestorage.googleapis.com`,_=`storageBucket`,ae=120*1e3,v=600*1e3,y=class t extends e{constructor(e,n,r=0){super(x(e),`Firebase Storage: ${n} (${x(e)})`),this.status_=r,this.customData={serverResponse:null},this._baseMessage=this.message,Object.setPrototypeOf(this,t.prototype)}get status(){return this.status_}set status(e){this.status_=e}_codeEquals(e){return x(e)===this.code}get serverResponse(){return this.customData.serverResponse}set serverResponse(e){this.customData.serverResponse=e,this.customData.serverResponse?this.message=`${this._baseMessage}\n${this.customData.serverResponse}`:this.message=this._baseMessage}},b;(function(e){e.UNKNOWN=`unknown`,e.OBJECT_NOT_FOUND=`object-not-found`,e.BUCKET_NOT_FOUND=`bucket-not-found`,e.PROJECT_NOT_FOUND=`project-not-found`,e.QUOTA_EXCEEDED=`quota-exceeded`,e.UNAUTHENTICATED=`unauthenticated`,e.UNAUTHORIZED=`unauthorized`,e.UNAUTHORIZED_APP=`unauthorized-app`,e.RETRY_LIMIT_EXCEEDED=`retry-limit-exceeded`,e.INVALID_CHECKSUM=`invalid-checksum`,e.CANCELED=`canceled`,e.INVALID_EVENT_NAME=`invalid-event-name`,e.INVALID_URL=`invalid-url`,e.INVALID_DEFAULT_BUCKET=`invalid-default-bucket`,e.NO_DEFAULT_BUCKET=`no-default-bucket`,e.CANNOT_SLICE_BLOB=`cannot-slice-blob`,e.SERVER_FILE_WRONG_SIZE=`server-file-wrong-size`,e.NO_DOWNLOAD_URL=`no-download-url`,e.INVALID_ARGUMENT=`invalid-argument`,e.INVALID_ARGUMENT_COUNT=`invalid-argument-count`,e.APP_DELETED=`app-deleted`,e.INVALID_ROOT_OPERATION=`invalid-root-operation`,e.INVALID_FORMAT=`invalid-format`,e.INTERNAL_ERROR=`internal-error`,e.UNSUPPORTED_ENVIRONMENT=`unsupported-environment`})(b||={});function x(e){return`storage/`+e}function oe(){return new y(b.UNKNOWN,`An unknown error occurred, please check the error payload for server response.`)}function se(){return new y(b.RETRY_LIMIT_EXCEEDED,`Max retry time for operation exceeded, please try again.`)}function ce(){return new y(b.CANCELED,`User canceled the upload/download.`)}function le(e){return new y(b.INVALID_URL,`Invalid URL '`+e+`'.`)}function ue(e){return new y(b.INVALID_DEFAULT_BUCKET,`Invalid default bucket '`+e+`'.`)}function de(){return new y(b.NO_DEFAULT_BUCKET,`No default bucket found. Did you set the '`+_+`' property when initializing the app?`)}function S(e){return new y(b.INVALID_ARGUMENT,e)}function C(){return new y(b.APP_DELETED,`The Firebase app was deleted.`)}function fe(e){return new y(b.INVALID_ROOT_OPERATION,`The operation '`+e+`' cannot be performed on a root reference, create a non-root reference using child, such as .child('file.png').`)}
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
var w=class e{constructor(e,t){this.bucket=e,this.path_=t}get path(){return this.path_}get isRoot(){return this.path.length===0}fullServerUrl(){let e=encodeURIComponent;return`/b/`+e(this.bucket)+`/o/`+e(this.path)}bucketOnlyServerUrl(){return`/b/`+encodeURIComponent(this.bucket)+`/o`}static makeFromBucketSpec(t,n){let r;try{r=e.makeFromUrl(t,n)}catch{return new e(t,``)}if(r.path===``)return r;throw ue(t)}static makeFromUrl(t,n){let r=null,i=`([A-Za-z0-9.\\-_]+)`;function a(e){e.path.charAt(e.path.length-1)===`/`&&(e.path_=e.path_.slice(0,-1))}let o=RegExp(`^gs://`+i+`(/(.*))?$`,`i`),s={bucket:1,path:3};function c(e){e.path_=decodeURIComponent(e.path)}let l=n.replace(/[.]/g,`\\.`),u=RegExp(`^https?://${l}/v[A-Za-z0-9_]+/b/${i}/o(/([^?#]*).*)?\$`,`i`),d={bucket:1,path:3},f=n===g?`(?:storage.googleapis.com|storage.cloud.google.com)`:n,p=RegExp(`^https?://${f}/${i}/([^?#]*)`,`i`),m=[{regex:o,indices:s,postModify:a},{regex:u,indices:d,postModify:c},{regex:p,indices:{bucket:1,path:2},postModify:c}];for(let n=0;n<m.length;n++){let i=m[n],a=i.regex.exec(t);if(a){let t=a[i.indices.bucket],n=a[i.indices.path];n||=``,r=new e(t,n),i.postModify(r);break}}if(r==null)throw le(t);return r}},pe=class{constructor(e){this.promise_=Promise.reject(e)}getPromise(){return this.promise_}cancel(e=!1){}};
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
function me(e,t,n){let r=1,i=null,a=null,o=!1,s=0;function c(){return s===2}let l=!1;function u(...e){l||(l=!0,t.apply(null,e))}function d(t){i=setTimeout(()=>{i=null,e(p,c())},t)}function f(){a&&clearTimeout(a)}function p(e,...t){if(l){f();return}if(e){f(),u.call(null,e,...t);return}if(c()||o){f(),u.call(null,e,...t);return}r<64&&(r*=2);let n;s===1?(s=2,n=0):n=(r+Math.random())*1e3,d(n)}let m=!1;function h(e){m||(m=!0,f(),!l&&(i===null?e||(s=1):(e||(s=2),clearTimeout(i),d(0))))}return d(0),a=setTimeout(()=>{o=!0,h(!0)},n),h}function he(e){e(!1)}
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
function ge(e){return e!==void 0}function T(e,t,n,r){if(r<t)throw S(`Invalid value for '${e}'. Expected ${t} or greater.`);if(r>n)throw S(`Invalid value for '${e}'. Expected ${n} or less.`)}function _e(e){let t=encodeURIComponent,n=`?`;for(let r in e)if(e.hasOwnProperty(r)){let i=t(r)+`=`+t(e[r]);n=n+i+`&`}return n=n.slice(0,-1),n}var E;(function(e){e[e.NO_ERROR=0]=`NO_ERROR`,e[e.NETWORK_ERROR=1]=`NETWORK_ERROR`,e[e.ABORT=2]=`ABORT`})(E||={});
/**
* @license
* Copyright 2022 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
function D(e,t){let n=e>=500&&e<600,r=[408,429].indexOf(e)!==-1,i=t.indexOf(e)!==-1;return n||r||i}
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
var O=class{constructor(e,t,n,r,i,a,o,s,c,l,u,d=!0,f=!1){this.url_=e,this.method_=t,this.headers_=n,this.body_=r,this.successCodes_=i,this.additionalRetryCodes_=a,this.callback_=o,this.errorCallback_=s,this.timeout_=c,this.progressCallback_=l,this.connectionFactory_=u,this.retry=d,this.isUsingEmulator=f,this.pendingConnection_=null,this.backoffId_=null,this.canceled_=!1,this.appDelete_=!1,this.promise_=new Promise((e,t)=>{this.resolve_=e,this.reject_=t,this.start_()})}start_(){let e=(e,t)=>{if(t){e(!1,new k(!1,null,!0));return}let n=this.connectionFactory_();this.pendingConnection_=n;let r=e=>{let t=e.loaded,n=e.lengthComputable?e.total:-1;this.progressCallback_!==null&&this.progressCallback_(t,n)};this.progressCallback_!==null&&n.addUploadProgressListener(r),n.send(this.url_,this.method_,this.isUsingEmulator,this.body_,this.headers_).then(()=>{this.progressCallback_!==null&&n.removeUploadProgressListener(r),this.pendingConnection_=null;let t=n.getErrorCode()===E.NO_ERROR,i=n.getStatus();if(!t||D(i,this.additionalRetryCodes_)&&this.retry){let t=n.getErrorCode()===E.ABORT;e(!1,new k(!1,null,t));return}let a=this.successCodes_.indexOf(i)!==-1;e(!0,new k(a,n))})},t=(e,t)=>{let n=this.resolve_,r=this.reject_,i=t.connection;if(t.wasSuccessCode)try{let e=this.callback_(i,i.getResponse());ge(e)?n(e):n()}catch(e){r(e)}else if(i!==null){let e=oe();e.serverResponse=i.getErrorText(),this.errorCallback_?r(this.errorCallback_(i,e)):r(e)}else if(t.canceled){let e=this.appDelete_?C():ce();r(e)}else{let e=se();r(e)}};this.canceled_?t(!1,new k(!1,null,!0)):this.backoffId_=me(e,t,this.timeout_)}getPromise(){return this.promise_}cancel(e){this.canceled_=!0,this.appDelete_=e||!1,this.backoffId_!==null&&he(this.backoffId_),this.pendingConnection_!==null&&this.pendingConnection_.abort()}},k=class{constructor(e,t,n){this.wasSuccessCode=e,this.connection=t,this.canceled=!!n}};function A(e,t){t!==null&&t.length>0&&(e.Authorization=`Firebase `+t)}function j(e,t){e[`X-Firebase-Storage-Version`]=`webjs/`+(t??`AppManager`)}function M(e,t){t&&(e[`X-Firebase-GMPID`]=t)}function N(e,t){t!==null&&(e[`X-Firebase-AppCheck`]=t)}function P(e,t,n,r,i,a,o=!0,s=!1){let c=_e(e.urlParams),l=e.url+c,u=Object.assign({},e.headers);return M(u,t),A(u,n),j(u,a),N(u,r),new O(l,e.method,u,e.body,e.successCodes,e.additionalRetryCodes,e.handler,e.errorHandler,e.timeout,e.progressCallback,i,o,s)}
/**
* @license
* Copyright 2017 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
function F(e){if(e.length===0)return null;let t=e.lastIndexOf(`/`);return t===-1?``:e.slice(0,t)}function I(e,t){let n=t.split(`/`).filter(e=>e.length>0).join(`/`);return e.length===0?n:e+`/`+n}function L(e){let t=e.lastIndexOf(`/`,e.length-2);return t===-1?e:e.slice(t+1)}var R=class e{constructor(e,t){this._service=e,t instanceof w?this._location=t:this._location=w.makeFromUrl(t,e.host)}toString(){return`gs://`+this._location.bucket+`/`+this._location.path}_newRef(t,n){return new e(t,n)}get root(){let e=new w(this._location.bucket,``);return this._newRef(this._service,e)}get bucket(){return this._location.bucket}get fullPath(){return this._location.path}get name(){return L(this._location.path)}get storage(){return this._service}get parent(){let t=F(this._location.path);if(t===null)return null;let n=new w(this._location.bucket,t);return new e(this._service,n)}_throwIfRoot(e){if(this._location.path===``)throw fe(e)}};function ve(e,t){let n=I(e._location.path,t),r=new w(e._location.bucket,n);return new R(e.storage,r)}function ye(e,t){if(e instanceof B){let n=e;if(n._bucket==null)throw de();let r=new R(n,n._bucket);return t==null?r:ye(r,t)}else if(t!==void 0)return ve(e,t);else return e}function z(e,t){let n=t?.[_];return n==null?null:w.makeFromBucketSpec(n,e)}var B=class{constructor(e,t,n,r,i,a=!1){this.app=e,this._authProvider=t,this._appCheckProvider=n,this._url=r,this._firebaseVersion=i,this._isUsingEmulator=a,this._bucket=null,this._host=g,this._protocol=`https`,this._appId=null,this._deleted=!1,this._maxOperationRetryTime=ae,this._maxUploadRetryTime=v,this._requests=new Set,r==null?this._bucket=z(this._host,this.app.options):this._bucket=w.makeFromBucketSpec(r,this._host)}get host(){return this._host}set host(e){this._host=e,this._url==null?this._bucket=z(e,this.app.options):this._bucket=w.makeFromBucketSpec(this._url,e)}get maxUploadRetryTime(){return this._maxUploadRetryTime}set maxUploadRetryTime(e){T(`time`,0,1/0,e),this._maxUploadRetryTime=e}get maxOperationRetryTime(){return this._maxOperationRetryTime}set maxOperationRetryTime(e){T(`time`,0,1/0,e),this._maxOperationRetryTime=e}async _getAuthToken(){if(this._overrideAuthToken)return this._overrideAuthToken;let e=this._authProvider.getImmediate({optional:!0});if(e){let t=await e.getToken();if(t!==null)return t.accessToken}return null}async _getAppCheckToken(){if(r(this.app)&&this.app.settings.appCheckToken)return this.app.settings.appCheckToken;let e=this._appCheckProvider.getImmediate({optional:!0});return e?(await e.getToken()).token:null}_delete(){return this._deleted||(this._deleted=!0,this._requests.forEach(e=>e.cancel()),this._requests.clear()),Promise.resolve()}_makeStorageReference(e){return new R(this,e)}_makeRequest(e,t,n,r,i=!0){if(this._deleted)return new pe(C());{let a=P(e,this._appId,n,r,t,this._firebaseVersion,i,this._isUsingEmulator);return this._requests.add(a),a.getPromise().then(()=>this._requests.delete(a),()=>this._requests.delete(a)),a}}async makeRequestWithTokens(e,t){let[n,r]=await Promise.all([this._getAuthToken(),this._getAppCheckToken()]);return this._makeRequest(e,t,n,r).getPromise()}},V=`@firebase/storage`,H=`0.14.0`,be=`storage`;function xe(e,{instanceIdentifier:t}){let n=e.getProvider(`app`).getImmediate(),r=e.getProvider(`auth-internal`),i=e.getProvider(`app-check-internal`);return new B(n,r,i,t,u)}function Se(){n(new ee(be,xe,`PUBLIC`).setMultipleInstances(!0)),s(V,H,``),s(V,H,`esm2020`)}Se();const U=async()=>(console.warn(`Firebase not configured`),[]),W=async e=>null,G=async(e,t)=>(console.log(`🔥 saveCustomFrame called`),console.log(`📊 isFirebaseConfigured:`,!1),console.log(`📊 db:`,!1),console.log(`📊 storage:`,!1),console.error(`❌ Firebase not configured properly`),{success:!1,message:`Firebase tidak dikonfigurasi. Cek console untuk detail.`}),K=async(e,t,n=null)=>({success:!1,message:`Firebase tidak dikonfigurasi`}),q=async e=>({success:!1,message:`Firebase tidak dikonfigurasi`}),J=async(e,t=`uses`)=>{},Y=async e=>{let t=await W(e);if(!t)return null;let n=1080,r=1920;return{id:t.id,name:t.name,description:t.description,maxCaptures:t.maxCaptures,duplicatePhotos:t.duplicatePhotos||!1,imagePath:t.imagePath,frameImage:t.imagePath,thumbnailUrl:t.thumbnailUrl,slots:t.slots,designer:{elements:(t.slots||[]).map((e,t)=>({id:e.id||`photo_`+(t+1),type:`photo`,x:e.left*n,y:e.top*r,width:e.width*n,height:e.height*r,rotation:Number.isFinite(e.rotation)?e.rotation:0,zIndex:e.zIndex||2,data:{photoIndex:e.photoIndex===void 0?t:e.photoIndex,image:null,aspectRatio:e.aspectRatio||`4:5`}}))},layout:t.layout||{aspectRatio:`9:16`,orientation:`portrait`,backgroundColor:`#ffffff`},category:t.category,isCustom:!0}},X=async()=>({success:!1}),Z=()=>({totalMB:`Cloud`,framesMB:`Cloud`,availableMB:`Unlimited`,isNearLimit:!1,isFull:!1,isFirebase:!0}),Q=async e=>G(e,null);var $={getAllCustomFrames:U,getCustomFrameById:W,saveCustomFrame:G,updateCustomFrame:K,deleteCustomFrame:q,incrementFrameStats:J,getCustomFrameConfig:Y,addCustomFrame:Q,clearAllCustomFrames:X,getStorageInfo:Z};export{Q as addCustomFrame,X as clearAllCustomFrames,$ as default,q as deleteCustomFrame,U as getAllCustomFrames,W as getCustomFrameById,Y as getCustomFrameConfig,Z as getStorageInfo,J as incrementFrameStats,G as saveCustomFrame,K as updateCustomFrame};