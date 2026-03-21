rm -rf dist
export SHERPA_ONNX_C_API_ONNXRUNTIME_DIR=~/nodejs-sherpa-onnx-senseVoice-gensrt/node-addon-api/sherpa-onnx-c-api-onnxruntime

export PATH=$PATH:$PWD/node_modules/.bin

vite build 
sleep 5
npx cap sync
sleep 5
cd android && ./gradlew assembledebug
./gradlew --stop
..


