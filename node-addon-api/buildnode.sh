rm -rf build
export PATH=$PATH:$PWD/node_modules/.bin
export ANDROID_ABI="arm64-v8a"
export ANDROID_PLATFORM=android-30
export ANDROID_SDK=~/Android ## ur android sdk path
export ANDROID_NDK=$ANDROID_SDK/ndk/29.0.14206865
export TOOLCHAIN=$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64
export SYSROOT=$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/sysroot
export TARGET=aarch64-linux-android
export API=30
export CC=$TOOLCHAIN/bin/$TARGET$API-clang
export CXX=$TOOLCHAIN/bin/$TARGET$API-clang++
export AR=$TOOLCHAIN/bin/llvm-ar
export LD=$TOOLCHAIN/bin/ld
export RANLIB=$TOOLCHAIN/bin/llvm-ranlib
export STRIP=$TOOLCHAIN/bin/llvm-strip

cmake-js compile --CMAKE_TOOLCHAIN_FILE="$ANDROID_NDK/build/cmake/android.toolchain.cmake" --BUILD_SHARED_LIBS="ON" --CMAKE_BUILD_TYPES="Release" --log-level verbose

cp build/Release/* ~/nodejs-sherpa-onnx-senseVoice-gensrt/static/nodejs/sherpa-onnx-node
