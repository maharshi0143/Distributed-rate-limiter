Write-Host "=== 1. Create Rule ==="
$rule = curl.exe -s -X POST http://localhost:3000/rules `
  -H "Content-Type: application/json" `
  -d '{"dimensions":[{"key":"ip","value":"1.2.3.4"}],"algorithm":"fixed_window","limit":3,"duration":10}'
$rule
$ruleId = ($rule | ConvertFrom-Json).rule.id

Write-Host "`n=== 2. Get Rule ==="
curl.exe -s http://localhost:3000/rules/$ruleId

Write-Host "`n`n=== 3. 3x gRPC ALLOWED ==="
node -e "
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const path = require('path');
const pkgDef = loader.loadSync(path.join('src','proto','rate_limiter.proto'));
const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
const c = new proto.RateLimiter('localhost:50051', grpc.credentials.createInsecure());
let count = 0;
for (let i = 0; i < 3; i++) {
  c.Evaluate({dimensions:[{key:'ip',value:'1.2.3.4'}],dry_run:false}, (e,r) => {
    console.log('Call ' + (++count) + ': ' + (r.decision === 1 ? 'ALLOWED' : 'DENIED'));
    if (count === 3) c.close();
  });
}
"

Start-Sleep -Seconds 1

Write-Host "`n=== 4. 4th gRPC DENIED ==="
node -e "
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const path = require('path');
const pkgDef = loader.loadSync(path.join('src','proto','rate_limiter.proto'));
const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
const c = new proto.RateLimiter('localhost:50051', grpc.credentials.createInsecure());
c.Evaluate({dimensions:[{key:'ip',value:'1.2.3.4'}],dry_run:false}, (e,r) => {
  console.log('Call 4: ' + (r.decision === 1 ? 'ALLOWED' : 'DENIED'));
  c.close();
});
"

Write-Host "`n=== 5. DELETE Rule ==="
curl.exe -s -o /dev/null -w "HTTP %{http_code}" -X DELETE http://localhost:3000/rules/$ruleId

Write-Host "`n=== 6. GET Deleted (expect 404) ==="
curl.exe -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/rules/$ruleId

Write-Host "`n`n=== 7. Create Override ==="
curl.exe -s -X POST http://localhost:3000/overrides `
  -H "Content-Type: application/json" `
  -d '{"dimensions":[{"key":"user_id","value":"test-user"}],"limit":5000,"ttl":15}'

Write-Host "`n`n=== 8. Dry Run Test ==="
curl.exe -s -X POST http://localhost:3000/rules `
  -H "Content-Type: application/json" `
  -d '{"dimensions":[{"key":"ip","value":"10.0.0.1"}],"algorithm":"fixed_window","limit":3,"duration":60}' | Out-Null

node -e "
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const path = require('path');
const pkgDef = loader.loadSync(path.join('src','proto','rate_limiter.proto'));
const proto = grpc.loadPackageDefinition(pkgDef).rate_limiter;
const c = new proto.RateLimiter('localhost:50051', grpc.credentials.createInsecure());
let done = 0;
const total = 6;
for (let i = 0; i < 5; i++) {
  c.Evaluate({dimensions:[{key:'ip',value:'10.0.0.1'}],dry_run:true}, (e,r) => {
    console.log('dry_run #' + (done+1) + ': ' + (r.decision === 1 ? 'ALLOWED' : 'DENIED'));
    if (++done === total) c.close();
  });
}
c.Evaluate({dimensions:[{key:'ip',value:'10.0.0.1'}],dry_run:false}, (e,r) => {
  console.log('real_call: ' + (r.decision === 1 ? 'ALLOWED' : 'DENIED'));
  if (++done === total) c.close();
});
"

Write-Host "`n=== Done ==="