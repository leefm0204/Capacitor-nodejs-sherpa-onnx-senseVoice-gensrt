cmake_minimum_required(VERSION 3.18)

project(sherpa-onnx LANGUAGES C CXX)

# ------------------------------------------------------------
# C++ standard
# ------------------------------------------------------------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ------------------------------------------------------------
# Build type
# ------------------------------------------------------------
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# ------------------------------------------------------------
# Android / ARM optimizations
# ------------------------------------------------------------
set(CMAKE_C_FLAGS_RELEASE "-O3 -ffast-math -fstrict-aliasing")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -ffast-math -fstrict-aliasing")

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -march=armv8-a+simd")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -march=armv8-a+simd")

# Link-time optimization
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION TRUE)

# Reduce symbol visibility
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN YES)

# Node addon settings
add_definitions(-DNAPI_DISABLE_CPP_EXCEPTIONS)

# ------------------------------------------------------------
# Environment paths
# ------------------------------------------------------------
set(SHERPA_ONNX_C_API_ONNXRUNTIME_DIR "${CMAKE_SOURCE_DIR}/sherpa-onnx-c-api-onnxruntime")

set(FFMPEG_INSTALL_DIR "${CMAKE_SOURCE_DIR}/FFmpeg")

# ------------------------------------------------------------
# FFmpeg include and lib paths (ANDROID_ABI-based)
# ------------------------------------------------------------

# ------------------------------------------------------------
# cmake-js includes
# ------------------------------------------------------------
include_directories(${CMAKE_JS_INC})

# ------------------------------------------------------------
# node-addon-api
# ------------------------------------------------------------
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
)

string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

include_directories(${NODE_ADDON_API_DIR})

# ------------------------------------------------------------
# Project include paths
# ------------------------------------------------------------
include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/include
  ${FFMPEG_INSTALL_DIR}/include
)

# ------------------------------------------------------------
# Source files
# ------------------------------------------------------------
set(srcs
  src/audio-tagging.cc
  src/keyword-spotting.cc
  src/non-streaming-asr.cc
  src/non-streaming-speaker-diarization.cc
  src/non-streaming-speech-denoiser.cc
  src/non-streaming-tts.cc
  src/punctuation.cc
  src/sherpa-onnx-node-addon-api.cc
  src/speaker-identification.cc
  src/spoken-language-identification.cc
  src/streaming-asr.cc
  src/vad.cc
  src/version.cc
  src/wave-reader.cc
  src/wave-writer.cc
  src/extract-audio-to-pcm.cc
  src/srt-writer.cc
)

# ------------------------------------------------------------
# Native helper library
# ------------------------------------------------------------
add_library(native-lib SHARED
    src/main/cpp/native-lib.cpp
    src/main/cpp/bridge.cpp
)

target_include_directories(native-lib PRIVATE
    ${CMAKE_SOURCE_DIR}/libnode/include/node
)

# ------------------------------------------------------------
# Imported libnode
# ------------------------------------------------------------
add_library(libnode SHARED IMPORTED)

set_target_properties(libnode PROPERTIES
  IMPORTED_LOCATION
  ${CMAKE_SOURCE_DIR}/libnode/bin/arm64-v8a/libnode.so
)

# ------------------------------------------------------------
# Sherpa-ONNX
# ------------------------------------------------------------
add_library(sherpa-onnx-c-api SHARED IMPORTED)

set_target_properties(sherpa-onnx-c-api PROPERTIES
  IMPORTED_LOCATION
  ${SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/lib/libsherpa-onnx-c-api.so
)

add_library(onnxruntime SHARED IMPORTED)

set_target_properties(onnxruntime PROPERTIES
  IMPORTED_LOCATION
  ${SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/lib/libonnxruntime.so
)


# ------------------------------------------------------------
# FFmpeg
# ------------------------------------------------------------
# Codec library
add_library(avcodec STATIC IMPORTED)
set_target_properties(avcodec PROPERTIES
  IMPORTED_LOCATION
  ${FFMPEG_INSTALL_DIR}/lib/libavcodec.a
)

# File format libraries are required for most operations
add_library(avformat STATIC IMPORTED)
set_target_properties(avformat PROPERTIES
  IMPORTED_LOCATION
  ${FFMPEG_INSTALL_DIR}/lib/libavformat.a
)

# Tool library
add_library(avutil STATIC IMPORTED)
set_target_properties(avutil PROPERTIES
  IMPORTED_LOCATION
  ${FFMPEG_INSTALL_DIR}/lib/libavutil.a
)

# The resampling library is mainly used for audio conversion
add_library(swresample STATIC IMPORTED)
set_target_properties(swresample PROPERTIES
  IMPORTED_LOCATION
  ${FFMPEG_INSTALL_DIR}/lib/libswresample.a
)

# Video format conversion library is mainly used for video conversion
add_library(swscale STATIC IMPORTED)
set_target_properties(swscale PROPERTIES
  IMPORTED_LOCATION
  ${FFMPEG_INSTALL_DIR}/lib/libswscale.a
)

# ------------------------------------------------------------
# Android log
# ------------------------------------------------------------
find_library( log-lib
              log )
# ------------------------------------------------------------
# Node addon (.node)
# ------------------------------------------------------------
add_library(${PROJECT_NAME} SHARED
  ${srcs}
  ${CMAKE_JS_SRC}
)

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
  POSITION_INDEPENDENT_CODE ON
)

# ------------------------------------------------------------
# Compiler options
# ------------------------------------------------------------
target_compile_options(${PROJECT_NAME} PRIVATE
  -O3
  -ffast-math
  -funsafe-math-optimizations
  -fpic
  -Bsymbolic
)

# ------------------------------------------------------------
# Linker options
# -----------------------------------------------------------
# ------------------------------------------------------------
# Link libraries
# ------------------------------------------------------------
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB}
  sherpa-onnx-c-api onnxruntime libnode native-lib log
  avformat avcodec avutil swresample swscale
)
# ------------------------------------------------------------
# Runtime loader path
# ------------------------------------------------------------
