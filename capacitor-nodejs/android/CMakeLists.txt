cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)
project(sherpa-onnx)

set(CMAKE_CXX_STANDARD 17)

set(SHERPA_ONNX_C_API_ONNXRUNTIME_DIR $ENV{SHERPA_ONNX_C_API_ONNXRUNTIME_DIR})

include_directories(${CMAKE_SOURCE_DIR})
add_library( native-lib
             SHARED
             src/main/cpp/native-lib.cpp
             src/main/cpp/bridge.cpp )

include_directories(libnode/include/node/)

add_library( libnode
             SHARED
             IMPORTED )

set_target_properties( libnode
                       PROPERTIES IMPORTED_LOCATION
                       ${CMAKE_SOURCE_DIR}/libnode/bin/arm64-v8a/libnode.so )

find_library( log-lib
              log )


link_directories($ENV{SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/lib)

include_directories($ENV{SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/include)

add_library( sherpa-onnx-c-api
             SHARED
             IMPORTED )

set_target_properties( sherpa-onnx-c-api
                       PROPERTIES IMPORTED_LOCATION
                       $ENV{SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/lib/libsherpa-onnx-c-api.so)

add_library( onnxruntime
             SHARED
             IMPORTED )

set_target_properties( onnxruntime
                       PROPERTIES IMPORTED_LOCATION
                       $ENV{SHERPA_ONNX_C_API_ONNXRUNTIME_DIR}/lib/libonnxruntime.so)



target_link_libraries( native-lib
  sherpa-onnx-c-api
  onnxruntime
  libnode
  log
)
