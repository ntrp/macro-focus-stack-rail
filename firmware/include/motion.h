#pragma once

class String;

namespace Motion {

void setup();
void update();
void startMove(float distanceMm);
void startHoming();
void requestStop();
void zeroPosition();
void reject(const char* error);

String statusJson();
bool statusDirty();
void markStatusPublished();
void markStatusDirty();

}  // namespace Motion
