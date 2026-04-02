/*
Replicating Python's random.choices and Counter to generate shots
 */

export const simulateShots = (events, probabilities, k) => {
    const cumulativeWeights = [];
    let sum = 0;
    for (let i = 0; i < probabilities.length; i++) {
      sum += probabilities[i];
      cumulativeWeights.push(sum);
    }
    const counts = {};
    events.forEach(event => {
      counts[event] = 0;
    });

    for (let s = 0; s < k; s++) {
      const r = Math.random();
      for (let i = 0; i < cumulativeWeights.length; i++) {
        if (r <= cumulativeWeights[i]) {
          counts[events[i]]++;
          break;
        }
      }
    }
    return counts;
};