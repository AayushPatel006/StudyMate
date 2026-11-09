import { setWorldConstructor } from '@cucumber/cucumber';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';

class PlannerWorld {
  constructor() {
    this.tasks = [];
    this.availability = null;
    this.agent = null;
    this.now = null;
    this.tzOffset = 300; // New York
    this.plan = null;
    this.editResult = null;
  }
}
setWorldConstructor(PlannerWorld);
