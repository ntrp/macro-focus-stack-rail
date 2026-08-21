#pragma once

class String;

namespace Motion {

void setup();
void update();
void startMove(float coordinateMm, float speedMmS, bool absolute);
void startHoming();
void requestStop();
void setPosition(float positionMm);
void reject(const char* error);

String statusJson();
bool isActive();
bool statusDirty();
void markStatusPublished();
void markStatusDirty();

}  // namespace Motion
