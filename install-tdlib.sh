#!/usr/bin/env bash

sudo apt-get update --fix-missing && \

sudo apt-get upgrade --fix-missing && \

sudo apt-get install make git zlib1g-dev libssl-dev gperf cmake clang-10 libc++-dev libc++abi-dev -y && \

git clone --recursive https://github.com/tdlib/telegram-bot-api.git && \

cd telegram-bot-api && \

rm -rf build && \

mkdir build && \

cd build && \

CXXFLAGS="-stdlib=libc++" CC=/usr/bin/clang-10 CXX=/usr/bin/clang++-10 cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_INSTALL_PREFIX:PATH=/usr/local .. && \

cmake --build . --target install && \

cd ../.. && \

ls -l /usr/local/bin/telegram-bot-api*
